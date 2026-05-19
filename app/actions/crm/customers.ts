"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export interface DeleteCustomerResult {
  error: string | null;
  hardDeleted?: boolean;
}

/**
 * Delete a customer. Soft delete (set deletedAt) for full accounts so deal
 * and repair-order history survives; hard delete for guest accounts with
 * isTempPassword=true since they have no real account to preserve.
 *
 * ADMIN only — MANAGER cannot delete.
 */
export async function deleteCustomer(
  customerUserId: string,
): Promise<DeleteCustomerResult> {
  await requireRole(["ADMIN"]);

  const target = (await db.user.findUnique({
    where: { id: customerUserId },
    select: {
      id: true,
      isCustomer: true,
      isTempPassword: true,
      deletedAt: true,
    },
  })) as {
    id: string;
    isCustomer: boolean;
    isTempPassword: boolean;
    deletedAt: Date | null;
  } | null;

  if (!target) return { error: "Клиент не найден" };
  if (!target.isCustomer) return { error: "Это не клиент" };
  if (target.deletedAt) return { error: "Клиент уже удалён" };

  const hardDeleted = target.isTempPassword;

  if (hardDeleted) {
    await db.user.delete({ where: { id: customerUserId } });
  } else {
    await db.user.update({
      where: { id: customerUserId },
      data: { deletedAt: new Date() },
    });
  }

  revalidatePath("/admin/customers");
  if (!hardDeleted) {
    revalidatePath(`/admin/customers/${customerUserId}`);
  }
  return { error: null, hardDeleted };
}

/** Restore a soft-deleted customer. ADMIN only. */
export async function restoreCustomer(
  customerUserId: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN"]);

  const target = (await db.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, deletedAt: true },
  })) as { id: string; deletedAt: Date | null } | null;

  if (!target) return { error: "Клиент не найден" };
  if (!target.deletedAt) return { error: "Клиент не был удалён" };

  await db.user.update({
    where: { id: customerUserId },
    data: { deletedAt: null },
  });

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerUserId}`);
  return { error: null };
}
