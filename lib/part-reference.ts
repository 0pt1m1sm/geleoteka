/**
 * Чистые хелперы номенклатурного справочника (PartReference).
 * Без импортов и БД — используются и в server actions, и в тестах.
 */

/** Служебные артикулы, не являющиеся настоящими номерами деталей:
 *  ПОДЗАКАЗ-NN — позиции «под заказ» без известного OEM, VERIFY-* — тестовый
 *  мусор. В справочник не попадают — клиент закажет не ту деталь. */
export const SERVICE_ARTICLE_RE = /^(ПОДЗАКАЗ|VERIFY)/i;

/**
 * Кириллические двойники латинских букв. Все номера Mercedes начинаются с «A»,
 * менеджеры работают в русской раскладке, и «А» с «A» неразличимы на глаз.
 */
const CYRILLIC_LOOKALIKES: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H",
  О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X",
};

/**
 * Нормализация номера в ключ: верхний регистр, только буквы и цифры.
 * «A 463 720 03 46», «a463-720-0346» и «A4637200346» — один ключ.
 *
 * Кириллица СОХРАНЯЕТСЯ, и трогать это нельзя. Функция служит двум задачам:
 * ключ справочника и проверка «в коде есть буквы или цифры» для АРТИКУЛОВ, а
 * из артикула строится sku («ПОДЗАКАЗ-01» → база «ПОДЗАКАЗ01», см.
 * app/actions/parts.ts). Транслитерация здесь перекорёжила бы служебные коды —
 * «ПОДЗАКАЗ» стал бы «ПOДЗAКAЗ», потому что двойник есть не у каждой буквы, —
 * и сменила бы sku у живых товаров. Требование латиницы относится ТОЛЬКО к
 * ключу справочника, и живёт оно в oemKey.
 */
export function normalizeOem(raw: string): string {
  return raw.toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, "");
}

/**
 * Ключ СПРАВОЧНИКА из введённого номера: то же, что normalizeOem, но с
 * переводом кириллических двойников в латиницу.
 *
 * Зачем (находка ревью PR #109). Все номера Mercedes начинаются с «A»,
 * менеджеры работают в русской раскладке, и «А» с «A» неразличимы на глаз.
 * Пока двойники сохранялись, один номер разъезжался на две номенклатуры в
 * уникальном индексе, а канонический адрес живой карточки товара вёл на
 * страницу, которой нет: адрес по номеру принимает только латиницу. Тот же
 * несуществующий адрес попадал и в карту сайта.
 */
export function oemKey(raw: string): string {
  const latin = raw.toUpperCase().replace(/[А-ЯЁ]/g, (ch) => CYRILLIC_LOOKALIKES[ch] ?? ch);
  return normalizeOem(latin);
}

/**
 * Годится ли ключ как номер справочника. Двойники к этому моменту уже
 * переведены, так что сюда доходит только грубая ошибка ввода — например,
 * попытка завести служебный код или слово по-русски.
 */
export function isLatinOem(key: string): boolean {
  return /^[A-Z0-9]+$/.test(key);
}

/** Коды кузова Mercedes в свободном тексте: W463, W463A, X253, C118, H247,
 *  N293, R172, V167… Набор первых букв — по реальным кодам каталога
 *  VehicleGeneration; буквы A и S исключены намеренно: A — префикс
 *  OEM-номеров (A463…), S ловил бы обозначения моделей вроде «S500». */
const MODEL_CODE_RE = /\b([CHNRVWX][0-9]{3}[A-Z]?)\b/g;

/** Извлекает уникальные коды кузова из названия/описания:
 *  «Бампер передний G63 AMG (W463)» → ["W463"]. Регистр не важен. */
export function extractModelCodes(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.toUpperCase().matchAll(MODEL_CODE_RE)) out.add(m[1]);
  return [...out];
}

/** Синонимы кодов кузова: новый G-Class в каталоге — W463A, в текстах и
 *  прайсах его часто пишут как W464. Фильтры считают их одним кузовом. */
const GENERATION_CODE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  W463A: ["W464"],
  W464: ["W463A"],
};

/** Код кузова + его синонимы — для фильтрации `models hasSome`. */
export function expandGenerationCodes(codes: readonly string[]): string[] {
  const out = new Set<string>();
  for (const code of codes) {
    out.add(code);
    for (const alias of GENERATION_CODE_ALIASES[code] ?? []) out.add(alias);
  }
  return [...out];
}

export interface ReferenceCsvRow {
  oem: string;
  name: string;
  groupName: string | null;
  models: string[];
}

export interface ReferenceCsvResult {
  rows: ReferenceCsvRow[];
  errors: string[];
}

/**
 * Парсит вставленный текст «номер;название;группа;модели» — по строке на
 * позицию. Разделитель колонок: TAB, если есть в строке (вставка из Excel /
 * Numbers / 1С), иначе «;». Модели внутри ячейки — через запятую. Строка-
 * заголовок распознаётся по отсутствию цифр в первой колонке и пропускается.
 * Дубли по нормализованному номеру схлопываются (первая строка выигрывает).
 */
export function parseReferenceCsv(text: string): ReferenceCsvResult {
  const rows: ReferenceCsvRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  const lines = text.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const delimiter = line.includes("\t") ? "\t" : ";";
    const [oemRaw = "", nameRaw = "", groupRaw = "", modelsRaw = ""] = line
      .split(delimiter)
      .map((c) => c.trim());

    // Ключ справочника, а не просто нормализация: русская «А» в номере,
    // набранном в русской раскладке, обязана свестись к латинской.
    const oem = oemKey(oemRaw);
    // Заголовок: первая строка без единой цифры в колонке номера.
    if (i === 0 && oemRaw && !/\d/.test(oemRaw)) continue;

    if (!oem || !nameRaw) {
      errors.push(`Строка ${i + 1}: нужны номер и название («номер;название;группа;модели»)`);
      continue;
    }
    if (SERVICE_ARTICLE_RE.test(oemRaw)) {
      errors.push(`Строка ${i + 1}: «${oemRaw}» — служебный код, в справочник не заводится`);
      continue;
    }
    if (!isLatinOem(oem)) {
      // Иначе ключ с кириллицей дал бы канонический адрес карточки, ведущий на
      // 404, и такой же адрес в карте сайта (ревью PR #109).
      errors.push(`Строка ${i + 1}: «${oemRaw}» — номер записывается латиницей и цифрами`);
      continue;
    }
    if (seen.has(oem)) continue;
    seen.add(oem);

    rows.push({
      oem,
      name: nameRaw,
      groupName: groupRaw || null,
      models: modelsRaw
        ? modelsRaw.split(",").map((m) => m.trim()).filter(Boolean)
        : [],
    });
  }

  return { rows, errors };
}
