/**
 * Две правки вёрстки, обе — про то, что элемент оказался не там, где его ищут.
 *
 * 1. СТРОКА ПИСЬМА. Меню «⋯» стояло отдельной строкой под метками: метки слева
 *    внизу, кнопка справа ещё ниже. Теперь они в одном ряду. Проверяем не «на
 *    сколько пикселей разошлись», а СОВПАДЕНИЕ ВЕРТИКАЛЬНЫХ ЦЕНТРОВ полосы
 *    меток и кнопки — при разных высотах боксов это единственная величина,
 *    которая означает «на одном уровне».
 *
 * 2. ВКЛАДКИ КАРТОЧКИ КЛИЕНТА. Полоса уезжала за край экрана: «Обзор» обрезан
 *    слева, задачи — за правым краем. На узком экране её заменяет список.
 *
 * Контрольный прогон обязателен: он прогоняет СТАРУЮ разметку через те же
 * измерения. Если контроль тоже зелёный — измерение ничего не проверяет.
 *
 * CSS берётся из собранного бандла: смысл в том, чтобы проверять правила,
 * которые реально уедут в прод.
 *
 * Запуск: npm run verify-inbox-row-actions (после `npm run build`).
 */
import fs from "node:fs";
import path from "node:path";
import { webkit } from "@playwright/test";

const CHUNKS = path.join(process.cwd(), ".next/static/chunks");

function productionCss(): string {
  const files = fs.readdirSync(CHUNKS).filter((f) => f.endsWith(".css"));
  if (files.length === 0) throw new Error("CSS-бандл не найден — сначала `npm run build`");
  return files.map((f) => fs.readFileSync(path.join(CHUNKS, f), "utf8")).join("\n");
}

const CHIP =
  "shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground-muted)]";

/** Полоса меток — одна и та же в обеих раскладках. */
const MARKS = `
  <span class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--background-secondary)] text-[var(--foreground-muted)]">← ВХ</span>
  <span class="${CHIP}">e.mail.ru</span>
  <span class="${CHIP}">спам</span>`;

/** Кнопка «⋯» — ровно то, что рисует ActionsMenu. */
const MENU = `<div class="relative inline-block"><button class="btn btn-secondary px-2 py-2">⋯</button></div>`;

const MARKUP = `
<meta name="viewport" content="width=device-width, initial-scale=1" />
<main class="p-4">
  <!-- СТАРАЯ строка: кнопка отдельным блоком под карточкой. -->
  <div class="card p-0" data-card="old">
    <div class="px-4 py-3">
      <div class="flex items-baseline justify-between gap-3">
        <div class="font-medium truncate min-w-0">Вторая причина</div>
        <div class="shrink-0 text-xs">31 июл., 18:18</div>
      </div>
      <div class="mt-2 flex items-center gap-1.5 flex-wrap" data-band="old-marks">${MARKS}</div>
    </div>
    <div class="flex justify-end">
      <div class="pr-3 pb-3" data-band="old-menu">${MENU}</div>
    </div>
  </div>

  <!-- НОВАЯ строка: метки и кнопка в одном ряду. -->
  <div class="card p-0" data-card="new">
    <div class="relative row-clickable">
      <div class="px-4 py-3">
        <div class="flex items-baseline justify-between gap-3">
          <div class="font-medium truncate min-w-0">Вторая причина</div>
          <div class="shrink-0 text-xs">31 июл., 18:18</div>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <div class="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap" data-band="new-marks">${MARKS}</div>
          <div class="shrink-0 relative z-10" data-band="new-menu">${MENU}</div>
        </div>
      </div>
      <a href="#" class="absolute inset-0" data-role="overlay" aria-label="Открыть письмо"></a>
    </div>
  </div>

  <!-- Вкладки карточки клиента: старая полоса и новая пара «список + полоса». -->
  <div class="card" data-card="tabs-old">
    <div role="tablist" class="flex gap-1 border-b mb-6 overflow-x-auto" data-strip="old">
      <button class="px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px">Обзор</button>
      <button class="px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px">Автомобили (1)</button>
      <button class="px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px">Сделки (1)</button>
      <button class="px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px">Коммуникации</button>
    </div>
  </div>

  <div class="card" data-card="tabs-new">
    <div class="sm:hidden mb-6" data-select="new">
      <select class="input" aria-label="Раздел">
        <option>Обзор</option><option>Автомобили (1)</option>
        <option>Сделки (1)</option><option>Коммуникации</option>
      </select>
    </div>
    <div role="tablist" class="hidden sm:flex gap-1 border-b mb-6" data-strip="new">
      <button class="px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px">Обзор</button>
      <button class="px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px">Автомобили (1)</button>
      <button class="px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px">Сделки (1)</button>
      <button class="px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px">Коммуникации</button>
    </div>
  </div>
</main>`;

interface Band {
  /** Расхождение вертикальных центров полосы меток и кнопки, px. */
  centreGapPx: number;
  /** Лежат ли оба в одном flex-ряду — структурный признак, не пиксельный. */
  sameRow: boolean;
}

interface Strip {
  /** Полоса шире своего окна — значит уезжает за край и требует прокрутки. */
  scrolls: boolean;
  visible: boolean;
}

interface Measurement {
  bands: Record<string, Band>;
  strips: Record<string, Strip>;
  selectVisible: boolean;
  /** Ширина документа против ширины окна — горизонтальная прокрутка страницы. */
  pageOverflowPx: number;
  /** Перекрывает ли накладка-ссылка кнопку «⋯» (тогда меню не нажать). */
  menuOnTop: boolean;
}

async function measure(css: string, width: number): Promise<Measurement> {
  const browser = await webkit.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.setContent(`<style>${css}</style>${MARKUP}`, { waitUntil: "load" });

    // Внутри evaluate — только анонимные стрелки в .map: именованные функции
    // esbuild оборачивает в хелпер __name, которого в браузере нет.
    return (await page.evaluate(() => {
      const bands = Object.fromEntries(
        ["old", "new"].map((kind) => {
          const marks = document.querySelector(`[data-band="${kind}-marks"]`) as HTMLElement | null;
          const menu = document.querySelector(`[data-band="${kind}-menu"]`) as HTMLElement | null;
          if (!marks || !menu) return [kind, { centreGapPx: 9999, sameRow: false }];
          const a = marks.getBoundingClientRect();
          const b = menu.getBoundingClientRect();
          return [
            kind,
            {
              centreGapPx: Math.round(Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2)),
              sameRow: marks.parentElement === menu.parentElement,
            },
          ];
        }),
      );

      const strips = Object.fromEntries(
        ["old", "new"].map((kind) => {
          const el = document.querySelector(`[data-strip="${kind}"]`) as HTMLElement | null;
          if (!el) return [kind, { scrolls: false, visible: false }];
          const visible = getComputedStyle(el).display !== "none";
          return [kind, { scrolls: visible && el.scrollWidth > el.clientWidth + 1, visible }];
        }),
      );

      const sel = document.querySelector('[data-select="new"]') as HTMLElement | null;

      // Кнопка должна оставаться нажимаемой: накладка-ссылка растянута на всю
      // строку, и если она окажется сверху, меню перестанет открываться.
      const menuBtn = document.querySelector(
        '[data-band="new-menu"] button',
      ) as HTMLElement | null;
      let menuOnTop = false;
      if (menuBtn) {
        const r = menuBtn.getBoundingClientRect();
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        menuOnTop = hit === menuBtn || menuBtn.contains(hit);
      }

      return {
        bands,
        strips,
        selectVisible: sel != null && getComputedStyle(sel).display !== "none",
        pageOverflowPx: Math.round(
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        menuOnTop,
      };
    })) as Measurement;
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const css = productionCss();
  const phone = await measure(css, 390);
  const desktop = await measure(css, 1280);

  console.log("=== Телефон, 390px ===");
  console.log("метки/кнопка старая:", phone.bands.old);
  console.log("метки/кнопка новая: ", phone.bands.new);
  console.log("полоса вкладок старая:", phone.strips.old);
  console.log("полоса вкладок новая: ", phone.strips.new, "список:", phone.selectVisible);
  console.log("прокрутка страницы, px:", phone.pageOverflowPx);
  console.log("кнопка «⋯» поверх накладки:", phone.menuOnTop);
  console.log("\n=== Десктоп, 1280px ===");
  console.log("метки/кнопка новая: ", desktop.bands.new);
  console.log("полоса вкладок новая: ", desktop.strips.new, "список:", desktop.selectVisible);
  console.log("прокрутка страницы, px:", desktop.pageOverflowPx);

  const failures: string[] = [];

  // Контроль. Если старая раскладка проходит проверку — проверка пустая.
  if (phone.bands.old.sameRow) {
    failures.push("КОНТРОЛЬ: старая раскладка тоже в одном ряду — измерение ничего не различает");
  }
  if (phone.bands.old.centreGapPx <= 4) {
    failures.push(
      `КОНТРОЛЬ: у старой раскладки центры сходятся (${phone.bands.old.centreGapPx}px) — измерение нечувствительно`,
    );
  }
  if (!phone.strips.old.scrolls) {
    failures.push("КОНТРОЛЬ: старая полоса вкладок не уезжает за край — проверять нечего");
  }

  // Собственно проверки.
  if (!phone.bands.new.sameRow) failures.push("метки и «⋯» не в одном ряду");
  if (phone.bands.new.centreGapPx > 2) {
    failures.push(`центры меток и «⋯» разошлись на ${phone.bands.new.centreGapPx}px`);
  }
  if (!phone.menuOnTop) failures.push("накладка-ссылка перекрыла кнопку «⋯» — меню не нажать");
  if (phone.strips.new.visible) failures.push("на телефоне показана полоса вкладок вместо списка");
  if (!phone.selectVisible) failures.push("на телефоне нет списка разделов");
  if (phone.pageOverflowPx > 0) failures.push(`страница шире экрана на ${phone.pageOverflowPx}px`);

  if (desktop.bands.new.centreGapPx > 2) {
    failures.push(`на десктопе центры меток и «⋯» разошлись на ${desktop.bands.new.centreGapPx}px`);
  }
  if (!desktop.strips.new.visible) failures.push("на десктопе пропала полоса вкладок");
  if (desktop.strips.new.scrolls) failures.push("на десктопе полоса вкладок всё ещё уезжает");
  if (desktop.selectVisible) failures.push("на десктопе остался список разделов");

  console.log();
  if (failures.length > 0) {
    for (const f of failures) console.error("✗", f);
    process.exit(1);
  }
  console.log("✓ метки и «⋯» на одном уровне, кнопка нажимается, вкладки без прокрутки");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
