import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Данные первого клиента не должны жить в коде платформы.
 *
 * Гелеотека — первый арендатор, а не платформа. Пока её домен, юрлицо, почта и
 * идентификатор карточки в картах стоят литералами в `lib/`, `app/` и
 * `components/`, второй арендатор получает чужие данные: чужие отзывы на своём
 * сайте, чужой домен в карте сайта и в письмах, чужое юрлицо в реквизитах.
 *
 * Это не про красоту кода. Найденное в ревизии 02.09: `YANDEX_ORG_ID`
 * Гелеотеки в `lib/yandex.ts`, `https://geleoteka.ru` фолбэком в тринадцати
 * местах — при незаданной переменной окружения платформа считала себя
 * Гелеотекой.
 *
 * Разбор: `docs/plans/2026-09-02-module-settings-audit.md`.
 */

const NEEDLES: ReadonlyArray<{ what: string; pattern: RegExp }> = [
  { what: "домен первого клиента", pattern: /geleoteka\.ru/i },
  { what: "название первого клиента", pattern: /Гелеотека/ },
  { what: "номер организации в Яндекс Картах", pattern: /211932722600/ },
];

/**
 * Места, где упоминание первого клиента законно, — с причиной и условием
 * исчезновения. Список короткий намеренно: каждая строка здесь означает, что
 * второй арендатор чего-то не получит.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  // Почтовые умолчания, которые применяются, когда настройка пуста: адрес
  // получателя входящих и адрес для ответов. Тронуть их отдельно от разбора
  // почтовых настроек — значит рискнуть доставкой писем в бою. Уйдут, когда оба
  // станут обязательными настройками арендатора с внятным отказом при пустом
  // значении вместо молчаливого чужого адреса.
  "lib/email/inbound.ts": "адрес получателя входящих по умолчанию",
  "lib/email/transport.ts": "адрес для ответов по умолчанию",
};

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (full.includes("app/generated")) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) out.push(relative(process.cwd(), full));
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(join(process.cwd(), dir));
  return out;
}

describe("данные первого клиента в коде платформы", () => {
  for (const { what, pattern } of NEEDLES) {
    it(`не встречаются: ${what}`, () => {
      const offenders = sourceFiles().filter(
        (file) => !(file in ALLOWED) && pattern.test(readFileSync(file, "utf8")),
      );
      expect(
        offenders,
        `данные первого клиента (${what}) в коде платформы: ${offenders.join(", ")}. ` +
          "Это должно быть настройкой арендатора или содержимым, а не литералом.",
      ).toEqual([]);
    });
  }

  it("список исключений не протух", () => {
    // Исключение, в котором упоминаний уже нет, обязано уйти из списка: иначе
    // оно молча разрешает то, чего давно нет, и перестаёт быть щитом.
    const stale = Object.keys(ALLOWED).filter((file) => {
      let src: string;
      try {
        src = readFileSync(join(process.cwd(), file), "utf8");
      } catch {
        return true;
      }
      return !NEEDLES.some(({ pattern }) => pattern.test(src));
    });
    expect(stale, `лишние записи в списке исключений: ${stale.join(", ")}`).toEqual([]);
  });
});
