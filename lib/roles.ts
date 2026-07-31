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

export const ROLE_LABELS: Readonly<Record<AllowedRole, string>> = {
  NONE: "Без доступа",
  CLIENT: "Клиент",
  MASTER: "Мастер",
  WAREHOUSE_WORKER: "Кладовщик",
  MANAGER: "Менеджер",
  ADMIN: "Администратор",
};
