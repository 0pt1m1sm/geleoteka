/**
 * Чистые хелперы номенклатурного справочника (PartReference).
 * Без импортов и БД — используются и в server actions, и в тестах.
 */

/** Служебные артикулы, не являющиеся настоящими номерами деталей:
 *  ПОДЗАКАЗ-NN — позиции «под заказ» без известного OEM, VERIFY-* — тестовый
 *  мусор. В справочник не попадают — клиент закажет не ту деталь. */
export const SERVICE_ARTICLE_RE = /^(ПОДЗАКАЗ|VERIFY)/i;

/** Нормализация OEM-номера в ключ справочника: верхний регистр, только буквы и
 *  цифры. «A 463 720 03 46», «a463-720-0346» и «A4637200346» — один ключ. */
export function normalizeOem(raw: string): string {
  return raw.toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, "");
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

    const oem = normalizeOem(oemRaw);
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
