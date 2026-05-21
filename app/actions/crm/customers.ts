"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

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

// ── Contact aliases (secondary email/phone) ──────────────────────────────

/** Add a secondary email or phone for a customer. ADMIN/MANAGER. */
export async function addCustomerContact(
  customerUserId: string,
  type: "EMAIL" | "PHONE",
  rawValue: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const value =
    type === "EMAIL"
      ? rawValue.trim().toLowerCase()
      : normalizePhone(rawValue.trim());
  if (!value) return { error: "Пустое значение" };
  if (type === "EMAIL" && !value.includes("@")) {
    return { error: "Некорректный email" };
  }

  // Don't duplicate the customer's own primary contact.
  const owner = (await db.user.findUnique({
    where: { id: customerUserId },
    select: { email: true, phone: true },
  })) as { email: string; phone: string } | null;
  if (!owner) return { error: "Клиент не найден" };
  if (type === "EMAIL" && owner.email.toLowerCase() === value) {
    return { error: "Это основной email клиента" };
  }
  if (type === "PHONE" && owner.phone === value) {
    return { error: "Это основной телефон клиента" };
  }

  try {
    await db.customerContact.create({
      data: { userId: customerUserId, type, value },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Этот контакт уже привязан к клиенту" };
    }
    console.error("[addCustomerContact]", err);
    return { error: "Не удалось добавить контакт" };
  }

  revalidatePath(`/admin/customers/${customerUserId}`);
  return { error: null };
}

/** Remove a secondary contact alias. ADMIN/MANAGER. */
export async function deleteCustomerContact(
  contactId: string,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.customerContact.findUnique({
    where: { id: contactId },
    select: { userId: true },
  })) as { userId: string } | null;
  if (!existing) return { error: "Контакт не найден" };
  await db.customerContact.delete({ where: { id: contactId } });
  revalidatePath(`/admin/customers/${existing.userId}`);
  return { error: null };
}
