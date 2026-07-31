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
</main>`;

interface Overflow {
  field: string;
  inputRight: number;
  cardRight: number;
  overflowPx: number;
}

async function measure(css: string, breakFix: boolean): Promise<{ page: number; fields: Overflow[] }> {
  const browser = await webkit.launch();
  try {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    // Контроль ломает вёрстку заведомо — фиксированной шириной шире карточки.
    // Это проверяет чувствительность измерения, а не конкретную гипотезу:
    // воспроизвести собственную ширину нативного контрола iOS здесь нельзя.
    const undo = breakFix ? "<style>.input{width:600px;max-width:none}</style>" : "";
    await page.setContent(`<style>${css}</style>${undo}${MARKUP}`, { waitUntil: "load" });

    const result = await page.evaluate(() => {
      const card = document.querySelector(".card") as HTMLElement;
      const cardBox = card.getBoundingClientRect();
      const cardStyle = getComputedStyle(card);
      const innerRight = cardBox.right - parseFloat(cardStyle.paddingRight);
      const fields = [...document.querySelectorAll("[data-field]")].map((el) => {
        const input = el.querySelector("input") as HTMLInputElement;
        const r = input.getBoundingClientRect();
        return {
          field: (el as HTMLElement).dataset.field ?? "?",
          inputRight: Math.round(r.right),
          cardRight: Math.round(innerRight),
          overflowPx: Math.round(r.right - innerRight),
        };
      });
      return {
        page: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
        fields,
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
  const pageOk = fixed.page <= 1;
  if (!pageOk) failures++;
  console.log(`  ${pageOk ? "✅" : "❌"} горизонтальная прокрутка страницы: ${fixed.page}px`);

  console.log(failures === 0 ? "\n✅ ВСЁ СОШЛОСЬ" : `\n❌ ПРОВАЛОВ: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
