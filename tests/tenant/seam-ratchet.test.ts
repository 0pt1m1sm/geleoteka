import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Храповик перевода на шов.
 *
 * Перевод пятисот с лишним обращений к базе — работа не на один заход, и
 * главная опасность не в её объёме, а в откате: модуль, уже переведённый,
 * тихо возвращается к прямому клиенту при следующей правке, и защита
 * исчезает незаметно.
 *
 * Поэтому список переведённых модулей ведётся здесь. Добавил модуль в список —
 * назад дороги нет. Список растёт по мере работы; пока он короткий, и это
 * честнее, чем объявить всё сделанным.
 */
const MIGRATED = ["lib/customer-queries.ts"];

describe("модули, переведённые на шов", () => {
  it("не обращаются к клиенту базы напрямую", () => {
    const offenders = MIGRATED.filter((file) => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      return /^import\s+\{[^}]*\bdb\b[^}]*\}\s+from\s+"@\/lib\/db"/m.test(src);
    });
    expect(offenders, `вернулись к прямому клиенту: ${offenders.join(", ")}`).toEqual([]);
  });

  it("берут клиент из шва", () => {
    const missing = MIGRATED.filter((file) => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      return !src.includes("tenantDb");
    });
    expect(missing, `не используют шов: ${missing.join(", ")}`).toEqual([]);
  });
});
