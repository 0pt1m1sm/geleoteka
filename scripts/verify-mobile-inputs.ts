/**
 * Проверяет, что поля даты не распирают карточку на телефоне.
 *
 * Именно WebKit: у Chromium собственной ширины у date/datetime-local нет, и в
 * нём баг не воспроизводится вовсе — проверка на Chrome дала бы зелёный результат
 * при сломанной вёрстке. Поэтому берём тот же движок, что в Safari на iOS.
 *
 * CSS берётся из собранного бандла, а не пишется в тесте руками: смысл в том,
 * чтобы проверять правила, которые реально уедут в прод.
 *
 * Без <meta name="viewport"> мобильный Safari верстает на 980 CSS-пикселях и
 * потом масштабирует — эмуляция iPhone в таком документе просто не применяется,
 * и проверка меряет не то, что видит пользователь.
 *
 * ГРАНИЦА ПРИМЕНИМОСТИ. WebKit в Playwright на macOS рисует date/datetime-local
 * по-десктопному, а iOS Safari — нативным контролом со своей собственной
 * шириной. Именно из-за этой разницы здесь НЕ воспроизводится переполнение,
 * которое видно на телефоне: проверено переопределением min-width — поле всё
 * равно оставалось в границах. Значит этот скрипт ловит обычные ошибки вёрстки
 * (ширины, отступы, переполнение страницы), но не подтверждает исправление
 * iOS-специфичного поведения — его проверяет только живое устройство.
 *
 * Контрольный прогон обязателен: он показывает, что измерение вообще способно
 * увидеть выход за карточку.
 *
 * Запуск: npm run verify-mobile-inputs (нужен `npm run build` перед этим).
 */
import fs from "node:fs";
import path from "node:path";
import { webkit, devices } from "@playwright/test";

const CHUNKS = path.join(process.cwd(), ".next/static/chunks");

function productionCss(): string {
  const files = fs.readdirSync(CHUNKS).filter((f) => f.endsWith(".css"));
  if (files.length === 0) {
    throw new Error("CSS-бандл не найден — сначала `npm run build`");
  }
  return files.map((f) => fs.readFileSync(path.join(CHUNKS, f), "utf8")).join("\n");
}

/** Разметка ровно та, что даёт компонент Input внутри карточки. */
const MARKUP = `
<meta name="viewport" content="width=device-width, initial-scale=1" />
<main class="p-4">
  <div class="card">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="flex flex-col gap-1.5 min-w-0" data-field="datetime">
        <label class="text-sm font-medium">Обещанная дата готовности</label>
        <div class="relative min-w-0">
          <input class="input" type="datetime-local" value="2026-07-16T20:00" />
        </div>
      </div>
      <div class="flex flex-col gap-1.5 min-w-0" data-field="date">
        <label class="text-sm font-medium">Дата</label>
        <div class="relative min-w-0">
          <input class="input" type="date" value="2026-07-16" />
        </div>
      </div>
      <div class="flex flex-col gap-1.5 min-w-0" data-field="text">
        <label class="text-sm font-medium">Пробег при выдаче (км)</label>
        <div class="relative min-w-0">
          <input class="input" type="text" placeholder="заполните при сдаче" />
        </div>
      </div>
    </div>
  </div>

  <!-- Строка почтового ящика: старая раскладка (дата и кнопки в одну строку с
       именем) против новой (дата уходит под тему). Меряем, сколько ширины
       достаётся имени отправителя — именно оно обрезалось до «Alex Tern…». -->
  <div class="card" data-card="inbox">
    <div class="flex items-start" data-row="old">
      <a class="flex-1 min-w-0 flex items-start gap-4 px-4 py-3">
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate flex items-center gap-2">
            <span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded">← ВХ</span>
            <span class="truncate" data-measure="sender-old">Alex Terner &lt;aleksandr.spiskov@gmail.com&gt;</span>
          </div>
          <div class="text-sm truncate">Re: Test mail</div>
        </div>
        <div class="text-xs shrink-0">30 июл. 2026 г., 19:05</div>
      </a>
      <div class="flex items-center gap-1 shrink-0 pr-3 pt-3">
        <span class="btn-icon">A</span><span class="btn-icon">B</span><span class="btn-icon">C</span>
      </div>
    </div>

    <div class="flex flex-col" data-row="new">
      <a class="flex-1 min-w-0 flex items-start gap-4 px-4 py-3">
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate flex items-center gap-2">
            <span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded">← ВХ</span>
            <span class="truncate" data-measure="sender-new">Alex Terner &lt;aleksandr.spiskov@gmail.com&gt;</span>
          </div>
          <div class="text-sm truncate">Re: Test mail</div>
          <div class="mt-1 text-xs">30 июл., 19:05</div>
        </div>
      </a>
      <div class="flex items-center gap-1 self-end pr-3 pb-2">
        <span class="btn-icon">A</span><span class="btn-icon">B</span><span class="btn-icon">C</span>
      </div>
    </div>
  </div>

  <!-- Карточка письма: старая раскладка (две колонки) против новой (строки с
       общей базовой линией). Меряем расхождение базовых линий темы и времени. -->
  <div class="card" data-card="mail">
    <div class="px-4 py-3" data-row="mail-old">
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate" data-align="old-subject">Вторая причина</div>
          <div class="text-xs truncate">welcome@e.mail.ru</div>
        </div>
        <div class="shrink-0 text-right text-xs">
          <div data-align="old-time">31 июл., 18:18</div>
          <div class="mt-0.5">sales@geleoteka.ru</div>
        </div>
      </div>
    </div>

    <div class="px-4 py-3" data-row="mail-new">
      <div class="flex items-baseline justify-between gap-3">
        <div class="font-medium truncate min-w-0" data-align="new-subject">Вторая причина</div>
        <div class="shrink-0 text-xs" data-align="new-time">31 июл., 18:18</div>
      </div>
      <div class="flex items-baseline justify-between gap-3">
        <div class="text-xs truncate min-w-0">welcome@e.mail.ru</div>
        <div class="shrink-0 text-xs truncate max-w-[10rem]">sales@geleoteka.ru</div>
      </div>
    </div>
  </div>

  <!-- Реквизиты письма: длинный Message-Id без пробелов. У трека 1fr
       минимальная ширина равна содержимому, поэтому колонка распирала карточку.
       Проверяем и на телефоне, и на десктопе — замечено было на десктопе. -->
  <div class="card" data-card="meta">
    <dl class="grid grid-cols-1 sm:grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      <dt class="text-xs sm:text-sm">Message-Id</dt>
      <dd class="font-mono text-xs break-all" data-field="meta-msgid">&lt;49469088-8cbf-4b5e-b60c-5a6898f246e7@mlrmr.com&gt;</dd>
    </dl>
  </div>

  <!-- Часы работы: четыре колонки в одной строке — самое узкое место на телефоне. -->
  <div class="card" data-card="hours">
    <div class="grid grid-cols-[minmax(4rem,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 sm:gap-x-3 gap-y-1 items-center">
      <span class="text-xs">День</span>
      <span class="text-xs justify-self-center">Работаем</span>
      <span class="text-xs">С</span>
      <span class="text-xs">До</span>
      <label class="text-sm">Понедельник</label>
      <input type="checkbox" class="justify-self-center" />
      <input class="input w-full max-w-28" type="time" value="10:00" data-field="hours-open" />
      <input class="input w-full max-w-28" type="time" value="19:00" data-field="hours-close" />
    </div>
  </div>
</main>`;

interface Overflow {
  field: string;
  inputRight: number;
  cardRight: number;
  overflowPx: number;
}

async function measure(
  css: string,
  breakFix: boolean,
  viewport?: { width: number; height: number },
): Promise<{
  page: number;
  fields: Overflow[];
  widths: Record<string, number>;
  bottoms: Record<string, number>;
  alignedPairs: Record<string, { sameRow: boolean; alignItems: string }>;
}> {
  const browser = await webkit.launch();
  try {
    const ctx = await browser.newContext(
      viewport ? { viewport } : { ...devices["iPhone 13"] },
    );
    const page = await ctx.newPage();
    // Контроль ломает вёрстку заведомо — фиксированной шириной шире карточки.
    // Это проверяет чувствительность измерения, а не конкретную гипотезу:
    // воспроизвести собственную ширину нативного контрола iOS здесь нельзя.
    const undo = breakFix ? "<style>.input{width:600px;max-width:none}</style>" : "";
    await page.setContent(`<style>${css}</style>${undo}${MARKUP}`, { waitUntil: "load" });

    const result = await page.evaluate(() => {
      const fields = [...document.querySelectorAll("[data-field]")].map((el) => {
        // Мерить можно не только поля: переполнять карточку умеет и обычный
        // текст без пробелов. Берём вложенный input, если он есть, иначе сам
        // элемент.
        const target = (el.tagName === "INPUT" ? el : (el.querySelector("input") ?? el)) as HTMLElement;
        const card = target.closest(".card") as HTMLElement;
        const cardStyle = getComputedStyle(card);
        const innerRight = card.getBoundingClientRect().right - parseFloat(cardStyle.paddingRight);
        const r = target.getBoundingClientRect();
        return {
          field: (el as HTMLElement).dataset.field ?? "?",
          inputRight: Math.round(r.right),
          cardRight: Math.round(innerRight),
          overflowPx: Math.round(r.right - innerRight),
        };
      });
      // Выравнивание проверяем СТРУКТУРНО, а не в пикселях: items-baseline
      // совмещает базовые линии, а нижние границы боксов у текста 16px и 12px
      // всё равно расходятся на величину выносных элементов. Порог в пикселях
      // здесь ловил бы не перекос, а разницу кеглей.
      const alignedPairs = Object.fromEntries(
        ["old", "new"].map((kind) => {
          const a = document.querySelector(`[data-align="${kind}-subject"]`);
          const b = document.querySelector(`[data-align="${kind}-time"]`);
          const sameRow = a?.parentElement != null && a.parentElement === b?.parentElement;
          const alignItems = a?.parentElement
            ? getComputedStyle(a.parentElement).alignItems
            : "";
          return [kind, { sameRow, alignItems }];
        }),
      );
      const bottoms = Object.fromEntries(
        [...document.querySelectorAll("[data-align]")].map((el) => [
          (el as HTMLElement).dataset.align ?? "?",
          Math.round(el.getBoundingClientRect().bottom),
        ]),
      );
      const widths = Object.fromEntries(
        [...document.querySelectorAll("[data-measure]")].map((el) => [
          (el as HTMLElement).dataset.measure ?? "?",
          Math.round(el.getBoundingClientRect().width),
        ]),
      );
      return {
        page: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
        fields,
        widths,
        bottoms,
        alignedPairs,
      };
    });
    return result;
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const css = productionCss();
  let failures = 0;

  console.log("Контроль: ломаем ширину заведомо — переполнение должно быть видно");
  const broken = await measure(css, true);
  const brokenBad = broken.fields.filter((f) => f.overflowPx > 1);
  for (const f of broken.fields) {
    console.log(`  ${f.field.padEnd(9)} правый край поля ${f.inputRight}, карточки ${f.cardRight} → выход ${f.overflowPx}px`);
  }
  if (brokenBad.length === 0) {
    console.log("  ❌ контроль не сработал: тест не видит бага, значит ничего не доказывает");
    failures++;
  } else {
    console.log(`  ✅ баг воспроизводится: ${brokenBad.map((f) => f.field).join(", ")}`);
  }

  console.log("\nКак есть:");
  const fixed = await measure(css, false);
  for (const f of fixed.fields) {
    const ok = f.overflowPx <= 1;
    if (!ok) failures++;
    console.log(`  ${ok ? "✅" : "❌"} ${f.field.padEnd(9)} выход за карточку: ${f.overflowPx}px`);
  }
  // Читаемость: имени отправителя должно доставаться не меньше 200px, иначе
  // от «Alex Terner <…@gmail.com>» остаётся «Alex Tern…».
  const MIN_SENDER_PX = 200;
  const oldW = fixed.widths["sender-old"] ?? 0;
  const newW = fixed.widths["sender-new"] ?? 0;
  const senderOk = newW >= MIN_SENDER_PX;
  if (!senderOk) failures++;
  console.log(
    `  ${senderOk ? "✅" : "❌"} ширина имени отправителя: было ${oldW}px, стало ${newW}px (нужно ≥ ${MIN_SENDER_PX})`,
  );

  // Выравнивание: тема и время должны стоять на одной линии. Старая раскладка
  // держала их в разных колонках, и они расходились.
  const oldPair = fixed.alignedPairs.old ?? { sameRow: false, alignItems: "" };
  const newPair = fixed.alignedPairs.new ?? { sameRow: false, alignItems: "" };
  const alignOk = newPair.sameRow && newPair.alignItems === "baseline";
  if (!alignOk) failures++;
  const oldGap = Math.abs((fixed.bottoms["old-subject"] ?? 0) - (fixed.bottoms["old-time"] ?? 0));
  const newGap = Math.abs((fixed.bottoms["new-subject"] ?? 0) - (fixed.bottoms["new-time"] ?? 0));
  console.log(
    `  ${alignOk ? "✅" : "❌"} тема и время в одной строке по базовой линии: было ` +
      `sameRow=${oldPair.sameRow}/${oldPair.alignItems || "—"}, стало ` +
      `sameRow=${newPair.sameRow}/${newPair.alignItems}`,
  );
  console.log(`     (расхождение нижних границ: было ${oldGap}px, стало ${newGap}px — разница кеглей)`);

  const pageOk = fixed.page <= 1;
  if (!pageOk) failures++;
  console.log(`  ${pageOk ? "✅" : "❌"} горизонтальная прокрутка страницы: ${fixed.page}px`);

  // Десктоп: часть переполнений видна только там, где места больше и никто
  // их не ждёт — например реквизиты письма с длинным Message-Id.
  console.log("\nДесктоп (1280px):");
  const desk = await measure(css, false, { width: 1280, height: 900 });
  for (const f of desk.fields) {
    const ok = f.overflowPx <= 1;
    if (!ok) failures++;
    console.log(`  ${ok ? "✅" : "❌"} ${f.field.padEnd(11)} выход за карточку: ${f.overflowPx}px`);
  }
  const deskPageOk = desk.page <= 1;
  if (!deskPageOk) failures++;
  console.log(`  ${deskPageOk ? "✅" : "❌"} горизонтальная прокрутка страницы: ${desk.page}px`);

  console.log(failures === 0 ? "\n✅ ВСЁ СОШЛОСЬ" : `\n❌ ПРОВАЛОВ: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
