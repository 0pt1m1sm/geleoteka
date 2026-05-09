/**
 * Admin sidebar navigation data — single source of truth for both
 * AdminSidebar (desktop) and AdminMobileNav (mobile drawer).
 *
 * Adding a new admin page = add an entry here. No component changes.
 *
 * Group ids are stable URL-safe slugs used as DOM ids for ARIA wiring
 * (header button aria-controls → sub-item container id).
 *
 * Groups are organised by business module: Сервис (service workshop),
 * Запчасти (parts inventory + procurement), Аренда (rental fleet),
 * CRM (customer master), Сайт (public content).
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
      { href: "/admin/estimates", label: "Сметы" },
      { href: "/admin/team", label: "Команда" },
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
      { href: "/admin/customers", label: "Клиенты" },
    ],
  },
  {
    kind: "group",
    id: "admin-group-site",
    label: "Сайт",
    items: [
      { href: "/admin/cms", label: "Контент" },
      { href: "/admin/services", label: "Услуги" },
      { href: "/admin/vacancies", label: "Вакансии" },
      { href: "/admin/models", label: "Модели и поколения" },
    ],
  },
];

/** Pathname → href match. Exact match OR pathname is a sub-route of href. */
export function matchesHref(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/admin") return false;
  return pathname.startsWith(href + "/");
}

/**
 * Find the single most-specific (longest) href in `nav` whose path matches
 * `pathname`. Guarantees exactly one active link even when one nav href is a
 * prefix of another (e.g. /admin/suppliers vs /admin/suppliers/orders).
 */
export function findActiveHref(
  pathname: string,
  nav: readonly AdminNavEntry[],
): string | null {
  let bestMatch: string | null = null;
  for (const entry of nav) {
    const candidates =
      entry.kind === "link" ? [entry.href] : entry.items.map((i) => i.href);
    for (const href of candidates) {
      if (matchesHref(pathname, href)) {
        if (!bestMatch || href.length > bestMatch.length) {
          bestMatch = href;
        }
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
