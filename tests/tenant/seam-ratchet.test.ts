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
  // Страницы админки, кабинета и портала: тоже только читают. Проверены
  // обходом с настоящим входом на локальном сервере — до и после правки коды
  // ответов и объём содержимого совпали на всех 68 маршрутах.
  "app/(admin)/admin/audit/page.tsx",
  "app/(admin)/admin/blog/[id]/page.tsx",
  "app/(admin)/admin/blog/page.tsx",
  "app/(admin)/admin/calendar/page.tsx",
  "app/(admin)/admin/cms/page.tsx",
  "app/(admin)/admin/crm/deals/[id]/page.tsx",
  "app/(admin)/admin/crm/deals/page.tsx",
  "app/(admin)/admin/crm/estimates/[id]/page.tsx",
  "app/(admin)/admin/crm/estimates/page.tsx",
  "app/(admin)/admin/crm/inbox/[id]/page.tsx",
  "app/(admin)/admin/crm/inbox/page.tsx",
  "app/(admin)/admin/crm/tasks/page.tsx",
  "app/(admin)/admin/customers/[id]/page.tsx",
  "app/(admin)/admin/estimates/new/page.tsx",
  "app/(admin)/admin/models/[id]/page.tsx",
  "app/(admin)/admin/models/new/page.tsx",
  "app/(admin)/admin/models/page.tsx",
  "app/(admin)/admin/notifications/operations/page.tsx",
  "app/(admin)/admin/notifications/telegram/page.tsx",
  "app/(admin)/admin/orders/page.tsx",
  "app/(admin)/admin/page.tsx",
  "app/(admin)/admin/parts/[id]/page.tsx",
  "app/(admin)/admin/parts/new/page.tsx",
  "app/(admin)/admin/parts/page.tsx",
  "app/(admin)/admin/parts/refs/[id]/page.tsx",
  "app/(admin)/admin/parts/refs/page.tsx",
  "app/(admin)/admin/parts/requests/page.tsx",
  "app/(admin)/admin/rentals/[id]/page.tsx",
  "app/(admin)/admin/rentals/bookings/page.tsx",
  "app/(admin)/admin/rentals/page.tsx",
  "app/(admin)/admin/repair-orders/[id]/page.tsx",
  "app/(admin)/admin/repair-orders/page.tsx",
  "app/(admin)/admin/roles/page.tsx",
  "app/(admin)/admin/seo/page.tsx",
  "app/(admin)/admin/service-bays/page.tsx",
  "app/(admin)/admin/services/[id]/page.tsx",
  "app/(admin)/admin/services/page.tsx",
  "app/(admin)/admin/settings/inbound-log/page.tsx",
  "app/(admin)/admin/settings/integrations/page.tsx",
  "app/(admin)/admin/settings/mail-sync/page.tsx",
  "app/(admin)/admin/suppliers/[id]/page.tsx",
  "app/(admin)/admin/suppliers/orders/[id]/edit/page.tsx",
  "app/(admin)/admin/suppliers/orders/[id]/page.tsx",
  "app/(admin)/admin/suppliers/orders/new/page.tsx",
  "app/(admin)/admin/suppliers/orders/page.tsx",
  "app/(admin)/admin/suppliers/page.tsx",
  "app/(admin)/admin/team/[id]/page.tsx",
  "app/(admin)/admin/team/page.tsx",
  "app/(admin)/admin/users/[id]/page.tsx",
  "app/(admin)/admin/users/page.tsx",
  "app/(admin)/admin/vacancies/[id]/page.tsx",
  "app/(admin)/admin/vacancies/page.tsx",
  "app/(admin)/admin/warehouse/labels/page.tsx",
  "app/(admin)/admin/warehouse/packing/[id]/page.tsx",
  "app/(admin)/admin/warehouse/picking/[id]/page.tsx",
  "app/(admin)/admin/warehouse/receiving/[id]/page.tsx",
  "app/(admin)/admin/warehouse/reports/movements/page.tsx",
  "app/(admin)/admin/warehouse/stocktake/[id]/page.tsx",
  "app/(portal)/cabinet/cars/page.tsx",
  "app/(portal)/cabinet/estimates/[id]/page.tsx",
  "app/(portal)/cabinet/estimates/page.tsx",
  "app/(portal)/cabinet/history/page.tsx",
  "app/(portal)/cabinet/loyalty/page.tsx",
  "app/(portal)/cabinet/orders/page.tsx",
  "app/(portal)/cabinet/page.tsx",
  "app/(portal)/cabinet/rentals/page.tsx",
  "app/(portal)/cabinet/tracking/page.tsx",
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
