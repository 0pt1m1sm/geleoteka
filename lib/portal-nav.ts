import type { AdminNavEntry } from "./admin-nav";

/**
 * Portal (client cabinet) navigation. Same shape as admin-nav so the unified
 * Sidebar component handles both layers.
 */
export const portalNav: AdminNavEntry[] = [
  { kind: "link", href: "/cabinet", label: "Главная" },
  { kind: "link", href: "/cabinet/cars", label: "Мои авто" },
  { kind: "link", href: "/cabinet/history", label: "История" },
  { kind: "link", href: "/cabinet/tracking", label: "Статус" },
  { kind: "link", href: "/cabinet/estimates", label: "Сметы" },
  { kind: "link", href: "/cabinet/orders", label: "Запчасти" },
  { kind: "link", href: "/cabinet/rentals", label: "Аренда" },
  { kind: "link", href: "/cabinet/loyalty", label: "Лояльность" },
  { kind: "link", href: "/cabinet/notifications", label: "Уведомления" },
];
