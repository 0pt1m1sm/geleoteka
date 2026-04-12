/**
 * Admin sidebar navigation data — single source of truth for both
 * AdminSidebar (desktop) and AdminMobileNav (mobile drawer).
 *
 * Adding a new admin page = add an entry here. No component changes.
 *
 * Group ids are stable URL-safe slugs used as DOM ids for ARIA wiring
 * (header button aria-controls → sub-item container id).
 */

export interface AdminNavLink {
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
    id: "admin-group-operations",
    label: "Операции",
    items: [
      { href: "/admin/appointments", label: "Записи" },
      { href: "/admin/calendar", label: "Календарь" },
      { href: "/admin/estimates", label: "Сметы" },
      { href: "/admin/customers", label: "Клиенты" },
      { href: "/admin/orders", label: "Заказы клиентов" },
      { href: "/admin/rentals/bookings", label: "Бронирования" },
    ],
  },
  {
    kind: "group",
    id: "admin-group-management",
    label: "Управление",
    items: [
      { href: "/admin/parts", label: "Запчасти" },
      { href: "/admin/rentals", label: "Аренда" },
      { href: "/admin/cms", label: "Контент" },
      { href: "/admin/founders", label: "Учредители" },
      { href: "/admin/team", label: "Команда" },
    ],
  },
  {
    kind: "group",
    id: "admin-group-procurement",
    label: "Поставки",
    items: [
      { href: "/admin/suppliers", label: "Поставщики" },
      { href: "/admin/suppliers/orders", label: "Заказы поставщикам" },
    ],
  },
];
