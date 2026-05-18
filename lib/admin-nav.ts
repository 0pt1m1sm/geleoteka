/**
 * Admin sidebar navigation data — single source of truth for both
 * AdminSidebar (desktop) and AdminMobileNav (mobile drawer).
 *
 * Adding a new admin page = add an entry here. No component changes.
 *
 * Group ids are stable URL-safe slugs used as DOM ids for ARIA wiring
 * (header button aria-controls → sub-item container id).
 *
 * Module taxonomy (see docs/research/2026-05-11-crm-vs-ops-overlap-policy.md):
 *
 *   FOUNDATIONAL (always available, included in base SaaS plan):
 *     - Дашборд          platform overview
 *     - CRM              deals, customers, communications (commerce)
 *     - Сайт             marketing CMS + vacancies (public face)
 *     - Доступы          user / role management
 *
 *   OPTIONAL (per-tenant licensed, sidebar group hidden when disabled):
 *     - Сервис           workshop operations
 *     - Запчасти         parts catalog + warehouse + procurement
 *     - Аренда           rental fleet
 *
 * Future Tenant.licensedModules only enumerates the optional set;
 * foundational groups don't need an entry there.
 */

interface AdminNavLink {
  kind: "link";
  href: string;
  label: string;
}

export interface AdminNavGroup {
  kind: "group";
  id: string;
  label: string;
  items: { href: string; label: string }[];
}

export type AdminNavEntry = AdminNavLink | AdminNavGroup;

export const adminNav: AdminNavEntry[] = [
  { kind: "link", href: "/admin", label: "Дашборд" },
  {
    kind: "group",
    id: "admin-group-service",
    label: "Сервис",
    items: [
      { href: "/admin/repair-orders", label: "Записи" },
      { href: "/admin/calendar", label: "Календарь" },
      { href: "/admin/team", label: "Команда" },
      { href: "/admin/services", label: "Каталог услуг" },
    ],
  },
  {
    kind: "group",
    id: "admin-group-parts",
    label: "Запчасти",
    items: [
      { href: "/admin/parts", label: "Каталог" },
      { href: "/admin/orders", label: "Заказы клиентов" },
      { href: "/admin/suppliers", label: "Поставщики" },
      { href: "/admin/suppliers/orders", label: "Заказы поставщикам" },
      { href: "/admin/models", label: "Модели и поколения" },
    ],
  },
  {
    kind: "group",
    id: "admin-group-rentals",
    label: "Аренда",
    items: [
      { href: "/admin/rentals", label: "Автопарк" },
      { href: "/admin/rentals/bookings", label: "Бронирования" },
    ],
  },
  {
    kind: "group",
    id: "admin-group-crm",
    label: "CRM",
    items: [
      { href: "/admin/crm/deals", label: "Сделки" },
      { href: "/admin/crm/estimates", label: "Сметы" },
      { href: "/admin/crm/tasks?scope=open&owner=mine", label: "Задачи" },
      { href: "/admin/crm/inbox", label: "Входящие" },
      { href: "/admin/customers", label: "Клиенты" },
    ],
  },
  {
    kind: "group",
    id: "admin-group-iam",
    label: "Доступы",
    items: [
      { href: "/admin/users", label: "Пользователи" },
    ],
  },
  {
    kind: "group",
    id: "admin-group-site",
    label: "Сайт",
    items: [
      { href: "/admin/cms", label: "Контент" },
      { href: "/admin/vacancies", label: "Вакансии" },
    ],
  },
  {
    kind: "group",
    id: "admin-group-settings",
    label: "Настройки",
    items: [
      { href: "/admin/settings/integrations", label: "Интеграции" },
      { href: "/admin/settings/inbound-log", label: "Лог webhook-ов" },
    ],
  },
];

interface HrefSearch {
  get(key: string): string | null;
}

function parseHref(href: string): { path: string; query: URLSearchParams | null } {
  const [path, qs] = href.split("?");
  return { path, query: qs ? new URLSearchParams(qs) : null };
}

/** Pathname + search → href match. A nav href without a query matches by
 *  path only; a nav href with a query (e.g. `?status=ESTIMATE`) requires
 *  every query parameter on the href to be present with the same value
 *  on the current URL. Sub-route matching applies on the path portion. */
export function matchesHref(
  pathname: string,
  search: HrefSearch | null,
  href: string,
): boolean {
  const { path, query } = parseHref(href);
  const pathMatches =
    pathname === path || (path !== "/admin" && pathname.startsWith(path + "/"));
  if (!pathMatches) return false;
  if (!query) return true;
  if (!search) return false;
  for (const [k, v] of query) {
    if (search.get(k) !== v) return false;
  }
  return true;
}

/**
 * Find the single most-specific (longest) href in `nav` whose path matches
 * `pathname`. Guarantees exactly one active link even when one nav href is a
 * prefix of another (e.g. /admin/suppliers vs /admin/suppliers/orders).
 */
export function findActiveHref(
  pathname: string,
  search: HrefSearch | null,
  nav: readonly AdminNavEntry[],
): string | null {
  let bestMatch: string | null = null;
  let bestScore = -1;
  for (const entry of nav) {
    const candidates =
      entry.kind === "link" ? [entry.href] : entry.items.map((i) => i.href);
    for (const href of candidates) {
      if (!matchesHref(pathname, search, href)) continue;
      const { path, query } = parseHref(href);
      // Prefer longer path; tiebreak on query-specificity so an entry
      // with a matching `?status=…` wins over the same path without one.
      const score = path.length * 2 + (query ? 1 : 0);
      if (score > bestScore) {
        bestMatch = href;
        bestScore = score;
      }
    }
  }
  return bestMatch;
}

/** Find the label of the group that owns `activeHref`, if any. */
export function findActiveGroupLabel(
  activeHref: string | null,
  nav: readonly AdminNavEntry[],
): string | null {
  if (!activeHref) return null;
  for (const entry of nav) {
    if (entry.kind !== "group") continue;
    if (entry.items.some((item) => item.href === activeHref)) {
      return entry.label;
    }
  }
  return null;
}
