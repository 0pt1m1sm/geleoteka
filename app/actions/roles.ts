"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/tenant";
import { EDITABLE_ROLES, PERMISSIONS, isPermission } from "@/lib/permissions";

interface Result {
  error: string | null;
}

/**
 * Replace what a role may open.
 *
 * ADMIN is not editable and CLIENT/NONE are not roles for the admin panel, so
 * only the three staff roles are accepted — anything else is a caller error,
 * not a form the operator could have submitted.
 *
 * Writes a row for EVERY permission, granted or not. That is what makes
 * "nothing ticked" expressible: a role with no rows is treated as never
 * configured and falls back to the code defaults, so a partial write would
 * silently restore access the admin had just removed.
 */
export async function setRolePermissions(role: string, permissions: string[]): Promise<Result> {
  await requireRole(["ADMIN"]);

  if (!(EDITABLE_ROLES as readonly string[]).includes(role)) {
    return { error: "Права этой роли не редактируются" };
  }
  const granted = new Set(permissions.filter(isPermission));
  if (granted.size !== permissions.length) {
    return { error: "Неизвестное право в списке" };
  }

  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { tenantKey: TENANT_KEY, role } });
    await tx.rolePermission.createMany({
      data: PERMISSIONS.map((permission) => ({
        tenantKey: TENANT_KEY,
        role,
        permission,
        allowed: granted.has(permission),
      })),
    });
  });

  revalidatePath("/admin/roles");
  // The sidebar is built from these, and it is rendered by the admin layout on
  // every page — so the whole section has to be re-rendered, not just this one.
  revalidatePath("/admin", "layout");
  return { error: null };
}

/**
 * Drop a role's overrides so it runs on the code defaults again — the way back
 * from an edit that locked people out of something they needed.
 */
export async function resetRolePermissions(role: string): Promise<Result> {
  await requireRole(["ADMIN"]);
  if (!(EDITABLE_ROLES as readonly string[]).includes(role)) {
    return { error: "Права этой роли не редактируются" };
  }
  await db.rolePermission.deleteMany({ where: { tenantKey: TENANT_KEY, role } });
  revalidatePath("/admin/roles");
  revalidatePath("/admin", "layout");
  return { error: null };
}
