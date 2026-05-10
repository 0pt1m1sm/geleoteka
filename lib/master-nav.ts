import type { AdminNavEntry } from "./admin-nav";

/** Master/technician portal navigation. Single section: their queue. */
export const masterNav: AdminNavEntry[] = [
  { kind: "link", href: "/master", label: "Мои работы" },
];
