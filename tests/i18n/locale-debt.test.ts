import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Потолок зашитой России.
 *
 * Продукт универсальный, а код местами предполагает единственную страну:
 * символ рубля, локаль `ru-RU`, московский пояс, код валюты `RUB` — всё это
 * стоит литералами мимо форматирования. Разом их не заменить: за каждым местом
 * стоит вопрос, откуда там взять настройки арендатора, и в клиентских
 * компонентах ответ не такой, как в серверных.
 *
 * Поэтому — храповик, как у долга `requireRole`. Долг зафиксирован на сегодня и
 * может только убывать. Новый код обязан идти через `lib/i18n/format.ts`, и
 * попытка добавить ещё одно зашитое место роняет тесты вместе с числом,
 * которое надо будет опустить.
 *
 * Разбор и план — `docs/plans/2026-09-02-globalization.md`.
 */

/**
 * Сами ворота форматирования. Литералы внутри них — не долг, а определение:
 * где-то же должно быть написано, чем заполняется значение по умолчанию.
 */
const GATE_PREFIX = "lib/i18n/";

const CEILINGS: ReadonlyArray<{ what: string; pattern: RegExp; ceiling: number }> = [
  { what: "символ рубля", pattern: /₽/g, ceiling: 26 },
  { what: "локаль ru-RU", pattern: /ru-RU/g, ceiling: 25 },
  { what: "пояс Europe/Moscow", pattern: /Europe\/Moscow/g, ceiling: 2 },
  { what: "код валюты RUB", pattern: /"RUB"/g, ceiling: 6 },
];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (full.includes("app/generated")) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) {
        const rel = relative(process.cwd(), full);
        if (!rel.startsWith(GATE_PREFIX)) out.push(rel);
      }
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(join(process.cwd(), dir));
  return out;
}

/**
 * Убрать комментарии перед подсчётом.
 *
 * Первая версия считала любое вхождение, и половина «долга» оказалась
 * пояснениями: «Цена закупки за единицу, ₽», «Shipping ₽ = kg × ($/kg)».
 * Комментарий ничего не форматирует, а запрет на него сделал бы сторож
 * вредным: автор объясняет расчёт и получает красный CI.
 *
 * Разбор грубый — регулярками, без парсера. Строковый литерал со
 * последовательностью `//` внутри (адрес) он тоже срежет, и это приемлемо:
 * ошибка идёт в сторону занижения, а занижение долга храповик только
 * ужесточает.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

function count(pattern: RegExp): { total: number; files: string[] } {
  const files: string[] = [];
  let total = 0;
  for (const file of sourceFiles()) {
    const hits = stripComments(readFileSync(file, "utf8")).match(new RegExp(pattern.source, "g"));
    if (hits) {
      total += hits.length;
      files.push(`${file} (${hits.length})`);
    }
  }
  return { total, files };
}

describe("зашитая Россия не растёт", () => {
  for (const { what, pattern, ceiling } of CEILINGS) {
    it(`${what}: не больше ${ceiling} мест`, () => {
      const { total, files } = count(pattern);
      expect(
        total,
        total > ceiling
          ? `появились новые зашитые места (${what}). Форматируйте через lib/i18n/format.ts. Сейчас: ${files.join(", ")}`
          : `долг сократился до ${total} — опустите потолок в этом тесте, иначе храповик перестанет держать`,
      ).toBe(ceiling);
    });
  }
});
