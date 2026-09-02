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
 *
 * Побочный эффект перевода, о котором стоит знать заранее: тест, подменявший
 * `@/lib/db` ради модуля, теперь обязан подменять `@/lib/tenant/scoped-db` —
 * иначе шов пойдёт в настоящую базу за арендатором. Подменять надо шов, а не
 * внутренности: предметом теста остаётся сам модуль.
 */
const MIGRATED = [
  "lib/customer-queries.ts",
  "lib/settings.ts",
  "lib/cms.ts",
  "lib/authz.ts",
  "lib/scheduling/day-availability.ts",
  "lib/seo-health.ts",
  "lib/crm/approved-estimate.ts",
  "lib/models/related-content.ts",
  "lib/crm/estimate-chain.ts",
  // Публичные страницы: читают и рисуют, записей нет — поэтому переведены
  // раньше остального приложения.
  "app/(public)/about/page.tsx",
  "app/(public)/blog/[slug]/page.tsx",
  "app/(public)/blog/page.tsx",
  "app/(public)/booking/page.tsx",
  "app/(public)/estimate/[token]/page.tsx",
  "app/(public)/models/[slug]/[code]/page.tsx",
  "app/(public)/models/[slug]/page.tsx",
  "app/(public)/page.tsx",
  "app/(public)/parts/[slug]/page.tsx",
  "app/(public)/parts/oem/[oem]/page.tsx",
  "app/(public)/parts/page.tsx",
  "app/(public)/rentals/[id]/page.tsx",
  "app/(public)/rentals/page.tsx",
  "app/(public)/services/[slug]/page.tsx",
  "app/(public)/services/page.tsx",
  "app/(public)/vacancies/page.tsx",
];

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
