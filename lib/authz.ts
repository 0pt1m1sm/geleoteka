/**
 * Whether a role may open a section — the stored answer, or the code default
 * when nobody has said otherwise.
 *
 * The facade `requireRole` never had: call sites ask about a CAPABILITY rather
 * than about a role, so the engine underneath can change (roles → permissions →
 * relationship-based) without touching them. `requireRole` keeps working
 * unchanged; nothing was rewritten to make room for this.
 *
 * ADMIN never reaches the table. A role that can edit roles must not be able to
 * lock itself out — an admin who unticked "Роли и права" would have no way back
 * in short of SQL — so it is answered `true` before any lookup.
 */
import { redirect } from "next/navigation";

import { getSession, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/tenant";
import { ROLE_DEFAULTS, type Permission } from "@/lib/permissions";

interface StoredRow {
  permission: string;
  allowed: boolean;
}

/**
 * A role's permissions as currently configured.
 *
 * No rows at all means "never edited", which falls back to the defaults —
 * that is what lets the table ship empty without changing anyone's access. Once
 * a role IS saved, every permission has a row, so an unticked box is a real
 * denial rather than an absence indistinguishable from an unconfigured role.
 */
export async function rolePermissions(role: string): Promise<Set<string>> {
  if (role === "ADMIN") return new Set<string>(); // callers short-circuit; never consulted
  const rows = (await db.rolePermission.findMany({
    where: { tenantKey: TENANT_KEY, role },
    select: { permission: true, allowed: true },
  })) as StoredRow[];

  if (rows.length === 0) return new Set<string>(ROLE_DEFAULTS[role] ?? []);
  return new Set<string>(rows.filter((r) => r.allowed).map((r) => r.permission));
}

/** Does this role open that section? ADMIN always does. */
export async function roleHasPermission(role: string, permission: Permission): Promise<boolean> {
  if (role === "ADMIN") return true;
  return (await rolePermissions(role)).has(permission);
}

/** The current viewer's answer, for a check that should not redirect. */
export async function can(permission: Permission): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return roleHasPermission(session.permissionRole, permission);
}

/**
 * The page / server-action form: the same contract as `requireRole`, so it
 * drops in where one stands today, but the call site names the CAPABILITY it
 * needs rather than a list of roles. That is what lets the engine underneath
 * change — roles today, per-resource rules later — without touching callers.
 *
 * Deliberately NOT for API routes: this redirects, and a fetch that wanted JSON
 * gets a login page. `lib/api-auth.ts` carries that shape.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await roleHasPermission(session.permissionRole, permission))) redirect("/");
  return session;
}

/**
 * Every editable role's permissions in one round-trip — for the roles page,
 * which would otherwise issue a query per role to render one table.
 */
export async function allRolePermissions(roles: readonly string[]): Promise<Map<string, Set<string>>> {
  const rows = (await db.rolePermission.findMany({
    where: { tenantKey: TENANT_KEY, role: { in: [...roles] } },
    select: { role: true, permission: true, allowed: true },
  })) as Array<StoredRow & { role: string }>;

  const configured = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!configured.has(row.role)) configured.set(row.role, new Set<string>());
    if (row.allowed) configured.get(row.role)!.add(row.permission);
  }
  // A role with no rows was never edited — show it the defaults it is actually
  // running on, not an empty table that would misreport its access as none.
  const seen = new Set(rows.map((r) => r.role));
  const result = new Map<string, Set<string>>();
  for (const role of roles) {
    result.set(
      role,
      seen.has(role) ? (configured.get(role) ?? new Set<string>()) : new Set<string>(ROLE_DEFAULTS[role] ?? []),
    );
  }
  return result;
}

/** True when this role has never been edited and is running on the defaults. */
export async function rolesUsingDefaults(roles: readonly string[]): Promise<Set<string>> {
  const rows = (await db.rolePermission.findMany({
    where: { tenantKey: TENANT_KEY, role: { in: [...roles] } },
    select: { role: true },
    distinct: ["role"],
  })) as Array<{ role: string }>;
  const configured = new Set(rows.map((r) => r.role));
  return new Set(roles.filter((r) => !configured.has(r)));
}
