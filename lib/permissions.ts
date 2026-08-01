/**
 * What the admin panel can be opened for, as data rather than as `if (role ===
 * "ADMIN")` scattered through 72 files.
 *
 * A permission names a SECTION, because that is the unit an owner actually
 * reasons about — "who may open Склад", not "who may call updateStockBin". The
 * finer-grained checks stay where they are; this is the layer that decides
 * whether the door opens at all, and it is the layer worth putting in front of
 * a person to edit.
 *
 * `ROLE_DEFAULTS` reproduces the hardcoded behaviour exactly as it stood on
 * 2026-07-31, so turning the system on changes nothing until somebody edits a
 * role. In particular MASTER gets nothing: the proxy admitted only
 * MANAGER/ADMIN (and WAREHOUSE_WORKER on the warehouse), and quietly handing
 * masters the admin panel is not a migration, it is a new decision — one an
 * admin can now make on the roles page instead of in a deploy.
 *
 * Pure module: no imports, no DB. `lib/authz.ts` layers the stored overrides on
 * top, `app/(admin)/admin/roles` edits them, `proxy.ts` enforces them.
 */

export const PERMISSIONS = [
  "dashboard.view",
  "service.manage",
  "parts.manage",
  "warehouse.manage",
  "rentals.manage",
  "crm.manage",
  "notifications.view",
  "notifications.manage",
  "users.manage",
  "roles.manage",
  "audit.view",
  "content.manage",
  "site.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(v: unknown): v is Permission {
  return typeof v === "string" && (PERMISSIONS as readonly string[]).includes(v);
}

export interface PermissionMeta {
  label: string;
  /** What opening it actually gets you — shown under the checkbox. */
  detail: string;
  /** Grouping in the editor, so eleven checkboxes read as four ideas. */
  group: "Работа" | "Продажи" | "Сайт" | "Администрирование";
}

export const PERMISSION_META: Readonly<Record<Permission, PermissionMeta>> = {
  "dashboard.view": {
    label: "Дашборд",
    detail: "Сводка по записям и выручке на главной админки",
    group: "Работа",
  },
  "service.manage": {
    label: "Сервис",
    detail: "Записи, календарь, каталог услуг",
    group: "Работа",
  },
  "warehouse.manage": {
    label: "Склад",
    detail: "Приёмка, размещение, отбор, инвентаризация",
    group: "Работа",
  },
  "parts.manage": {
    label: "Запчасти",
    detail: "Каталог, заказы клиентов, поставщики, модели",
    group: "Продажи",
  },
  "rentals.manage": {
    label: "Аренда",
    detail: "Автопарк и бронирования",
    group: "Продажи",
  },
  "crm.manage": {
    label: "CRM",
    detail: "Сделки, сметы, задачи, входящие письма, клиенты",
    group: "Продажи",
  },
  "notifications.view": {
    label: "Уведомления",
    detail: "Своя лента уведомлений и личная привязка Telegram",
    group: "Работа",
  },
  "notifications.manage": {
    label: "Управление уведомлениями",
    detail: "Общий Telegram-канал, dead-letter и ручной повтор доставок",
    group: "Администрирование",
  },
  "content.manage": {
    label: "Контент сайта",
    detail: "Тексты и блоки публичных страниц",
    group: "Сайт",
  },
  "site.manage": {
    label: "Команда и вакансии",
    detail: "Профили мастеров и вакансии на сайте",
    group: "Сайт",
  },
  "users.manage": {
    label: "Пользователи",
    detail: "Карточки доступа, сброс пароля, блокировка, удаление",
    group: "Администрирование",
  },
  "roles.manage": {
    label: "Роли и права",
    detail: "Эта страница. Кто её открывает — может выдать себе что угодно",
    group: "Администрирование",
  },
  "audit.view": {
    label: "Журнал действий",
    detail: "Кто удалял, менял роли и права — и когда",
    group: "Администрирование",
  },
  "settings.manage": {
    label: "Настройки",
    detail: "Интеграции, почта, лог входящих webhook-ов",
    group: "Администрирование",
  },
};

export const PERMISSION_GROUPS = ["Работа", "Продажи", "Сайт", "Администрирование"] as const;

/**
 * Exactly what each role could reach before permissions became editable.
 * ADMIN is absent on purpose — it is not stored or editable (see `authz.ts`),
 * because a role that can edit roles must never be able to lock itself out.
 */
export const ROLE_DEFAULTS: Readonly<Record<string, readonly Permission[]>> = {
  MANAGER: [
    "dashboard.view",
    "service.manage",
    "warehouse.manage",
    "parts.manage",
    "rentals.manage",
    "crm.manage",
    "notifications.view",
    "site.manage",
    "users.manage",
  ],
  MASTER: [],
  WAREHOUSE_WORKER: ["warehouse.manage"],
  CLIENT: [],
  NONE: [],
};

/** Roles whose permissions the page may edit — everything except ADMIN. */
export const EDITABLE_ROLES = ["MANAGER", "MASTER", "WAREHOUSE_WORKER"] as const;

/**
 * Which permission a path under /admin demands.
 *
 * Longest prefix wins, matched on segment boundaries so a future
 * `/admin/warehouse-reports` does not inherit `/admin/warehouse`.
 *
 * An unmapped /admin path falls back to `dashboard.view`, which doubles as
 * "may open the admin panel at all". Failing closed matters here: before this
 * existed the proxy admitted only MANAGER/ADMIN to every /admin route, so
 * returning null for a route somebody forgot to map would hand a warehouse
 * worker a page they were never meant to see. A path outside /admin is not this
 * function's business and returns null.
 */
const PATH_PERMISSIONS: ReadonlyArray<readonly [string, Permission]> = [
  ["/admin/warehouse", "warehouse.manage"],
  ["/admin/notifications", "notifications.view"],
  ["/admin/roles", "roles.manage"],
  ["/admin/audit", "audit.view"],
  ["/admin/users", "users.manage"],
  ["/admin/settings", "settings.manage"],
  ["/admin/crm", "crm.manage"],
  ["/admin/customers", "crm.manage"],
  ["/admin/repair-orders", "service.manage"],
  ["/admin/calendar", "service.manage"],
  ["/admin/services", "service.manage"],
  ["/admin/parts", "parts.manage"],
  ["/admin/orders", "parts.manage"],
  ["/admin/suppliers", "parts.manage"],
  ["/admin/models", "parts.manage"],
  ["/admin/rentals", "rentals.manage"],
  ["/admin/cms", "content.manage"],
  ["/admin/team", "site.manage"],
  ["/admin/vacancies", "site.manage"],
];

export interface StoredPermissionDecision {
  permission: string;
  allowed: boolean;
}

/**
 * Resolve stored role decisions while remaining forward-compatible with newly
 * introduced permissions. Older exhaustive rows cannot mention a permission
 * that did not exist when they were saved, so only those missing keys inherit
 * the current role default; an explicit false always remains a denial.
 */
export function resolveRolePermissions(
  role: string,
  rows: readonly StoredPermissionDecision[],
): Set<string> {
  const defaults = new Set<string>(ROLE_DEFAULTS[role] ?? []);
  if (rows.length === 0) return defaults;

  const decisions = new Map(rows.map((row) => [row.permission, row.allowed]));
  const granted = new Set<string>();
  for (const permission of PERMISSIONS) {
    const decision = decisions.get(permission);
    if (decision === true || (decision === undefined && defaults.has(permission))) {
      granted.add(permission);
    }
  }
  return granted;
}

export function permissionForPath(pathname: string): Permission | null {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return null;
  let best: { prefix: string; permission: Permission } | null = null;
  for (const [prefix, permission] of PATH_PERMISSIONS) {
    const onBoundary = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (!onBoundary) continue;
    if (!best || prefix.length > best.prefix.length) best = { prefix, permission };
  }
  return best?.permission ?? "dashboard.view";
}
