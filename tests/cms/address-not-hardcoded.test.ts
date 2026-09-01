import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Адрес живёт ТОЛЬКО в CMS.
 *
 * Найдено при подготовке к переезду сервиса. Адрес был зашит прямо в текст
 * СМС-напоминания, и это худшее место из возможных: устаревший адрес на сайте —
 * неточность, которую видно и можно поправить, а по адресу из напоминания
 * человек садится в машину и едет. Вспомнить про эту строку было неоткуда —
 * она не на виду.
 *
 * Сторож по исходнику: настоящий адрес узнаваем, и держать его в коде нельзя
 * нигде, кроме значения по умолчанию в самой схеме CMS.
 */
// Ищем именно АДРЕС, а не любое слово с тем же корнем: «примерно» в
// комментарии срабатывало ложно.
const ADDRESS_MARKERS = [/Пролетарск(ая|ой|ую)/i, /ул\.?\s*Примерн/i];
const ALLOWED = new Set(["lib/cms-schema.ts"]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe("адрес не зашит в код", () => {
  it("настоящий адрес встречается только в значении по умолчанию CMS", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "lib", "components"]) {
      for (const file of walk(dir)) {
        if (ALLOWED.has(file)) continue;
        const src = readFileSync(file, "utf8");
        for (const [i, line] of src.split("\n").entries()) {
          if (ADDRESS_MARKERS.some((re) => re.test(line))) offenders.push(`${file}:${i + 1}`);
        }
      }
    }
    expect(offenders, "адрес обязан браться из CMS — при переезде правится в одном месте").toEqual([]);
  });

  it("обход действительно что-то просмотрел", () => {
    // Пустой обход молчал бы так же убедительно, как полный.
    expect(walk("lib").length).toBeGreaterThan(20);
  });
});
