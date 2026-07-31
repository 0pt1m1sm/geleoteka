/**
 * The assignable permission roles and their Russian labels.
 *
 * Lives here rather than beside the server action that uses it: a `"use server"`
 * module may only export async functions, so a shared constant has to sit in a
 * plain module both the actions and the UI can import.
 */

export const ALLOWED_ROLES = [
  "NONE",
  "CLIENT",
  "MASTER",
  "WAREHOUSE_WORKER",
  "MANAGER",
  "ADMIN",
] as const;

export type AllowedRole = (typeof ALLOWED_ROLES)[number];

export function isAllowedRole(v: unknown): v is AllowedRole {
  return typeof v === "string" && (ALLOWED_ROLES as readonly string[]).includes(v);
}

/**
 * Label for a role that arrives as a plain string — which is how it comes back
 * through the db singleton and the session. Falls back to the raw value so an
 * enum member added without a label shows up as itself rather than as blank.
 */
export function roleLabel(role: string): string {
  return isAllowedRole(role) ? ROLE_LABELS[role] : role;
}

/**
 * What the person IS in the business, minus whatever the access-role badge
 * already says.
 *
 * The two are different ideas — `permissionRole` is what they may open,
 * `isCustomer`/`isMaster` is how the shop deals with them — but they collide
 * for the common case: a client with the CLIENT role rendered as "Клиент
 * · клиент", which reads as a mistake. A master with no login still shows
 * "мастер" next to "Без доступа", because there the flag carries information
 * the badge cannot.
 */
export function entityFlags(
  user: { isCustomer: boolean; isMaster: boolean },
  permissionRole: string,
): string[] {
  const role = roleLabel(permissionRole).toLowerCase();
  const flags: string[] = [];
  if (user.isCustomer) flags.push("Клиент");
  if (user.isMaster) flags.push("Мастер");
  return flags.filter((f) => f.toLowerCase() !== role);
}

export const ROLE_LABELS: Readonly<Record<AllowedRole, string>> = {
  NONE: "Без доступа",
  CLIENT: "Клиент",
  MASTER: "Мастер",
  WAREHOUSE_WORKER: "Кладовщик",
  MANAGER: "Менеджер",
  ADMIN: "Администратор",
};
