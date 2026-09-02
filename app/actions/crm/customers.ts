"use server";

import { revalidatePath } from "next/cache";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/authz";
import { roleLabel } from "@/lib/roles";
import { TENANT_KEY } from "@/lib/tenant";
import { normalizePhone } from "@/lib/utils";

export interface DeleteCustomerResult {
  error: string | null;
  hardDeleted?: boolean;
}

interface CustomerManagerResult {
  error: string | null;
}

interface CustomerManagerTx {
  user: {
    update(args: Record<string, unknown>): Promise<unknown>;
  };
  auditLog: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
}

/** Assign or clear the personal CRM manager shown in Customer 360. */
export async function setCustomerManager(
  _prevState: CustomerManagerResult | null,
  formData: FormData,
): Promise<CustomerManagerResult> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  const session = await requirePermission("crm.manage");
  const customerUserId =
    ((formData.get("customerUserId") as string | null) ?? "").trim();
  const managerUserId =
    ((formData.get("managerUserId") as string | null) ?? "").trim() || null;
  if (!customerUserId) return { error: "Клиент не найден" };

  const customer = (await db.user.findUnique({
    where: { id: customerUserId },
    select: {
      id: true,
      name: true,
      isCustomer: true,
      deletedAt: true,
      managerUserId: true,
    },
  })) as {
    id: string;
    name: string;
    isCustomer: boolean;
    deletedAt: Date | null;
    managerUserId: string | null;
  } | null;
  if (!customer || !customer.isCustomer || customer.deletedAt) {
    return { error: "Клиент не найден" };
  }

  if (managerUserId) {
    const manager = (await db.user.findUnique({
      where: { id: managerUserId },
      select: { id: true, permissionRole: true, deletedAt: true },
    })) as {
      id: string;
      permissionRole: string;
      deletedAt: Date | null;
    } | null;
    if (
      !manager ||
      manager.deletedAt !== null ||
      (manager.permissionRole !== "ADMIN" && manager.permissionRole !== "MANAGER")
    ) {
      return { error: "Менеджер не найден среди сотрудников" };
    }
  }

  if (customer.managerUserId === managerUserId) return { error: null };

  const transactionalDb = db as unknown as {
    $transaction<T>(callback: (tx: CustomerManagerTx) => Promise<T>): Promise<T>;
  };
  await transactionalDb.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: customerUserId },
      data: { managerUserId },
    });
    await tx.auditLog.create({
      data: {
        tenantKey: TENANT_KEY,
        actorUserId: session.id,
        actorName: session.name,
        actorRole: roleLabel(session.permissionRole),
        action: managerUserId
          ? "customer.manager_assign"
          : "customer.manager_unassign",
        targetType: "User",
        targetId: customer.id,
        targetLabel: customer.name,
        metadata: {
          previousManagerUserId: customer.managerUserId,
          managerUserId,
        },
        ip: null,
      },
    });
  });

  revalidatePath(`/admin/customers/${customerUserId}`);
  return { error: null };
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
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  const session = await requireRole(["ADMIN"]);

  const target = (await db.user.findUnique({
    where: { id: customerUserId },
    select: {
      id: true,
      name: true,
      isCustomer: true,
      isTempPassword: true,
      deletedAt: true,
    },
  })) as {
    id: string;
    name: string;
    isCustomer: boolean;
    isTempPassword: boolean;
    deletedAt: Date | null;
  } | null;

  if (!target) return { error: "Клиент не найден" };
  if (!target.isCustomer) return { error: "Это не клиент" };
  if (target.deletedAt) return { error: "Клиент уже удалён" };

  // Always soft-delete. This used to hard-delete when `isTempPassword` was set,
  // on the assumption that a guest account has nothing worth keeping — but
  // `isTempPassword` describes a CREDENTIAL, not the absence of history, and a
  // guest row is created BY a booking. Deleting one therefore cascaded away the
  // very repair order that produced it (verified in production: the single
  // guest customer owned a repair order and a deal). Archiving keeps the
  // history and stays reversible via restoreCustomer.
  await db.user.update({
    where: { id: customerUserId },
    data: { deletedAt: new Date() },
  });

  await recordAudit({
    actor: session,
    action: "customer.archive",
    targetType: "User",
    targetId: customerUserId,
    targetLabel: target.name,
  });

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerUserId}`);
  return { error: null, hardDeleted: false };
}

/** Restore a soft-deleted customer. ADMIN only. */
export async function restoreCustomer(
  customerUserId: string,
): Promise<{ error: string | null }> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
  const session = await requireRole(["ADMIN"]);

  const target = (await db.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, name: true, deletedAt: true },
  })) as { id: string; name: string; deletedAt: Date | null } | null;

  if (!target) return { error: "Клиент не найден" };
  if (!target.deletedAt) return { error: "Клиент не был удалён" };

  await db.user.update({
    where: { id: customerUserId },
    data: { deletedAt: null },
  });

  await recordAudit({
    actor: session,
    action: "customer.restore",
    targetType: "User",
    targetId: customerUserId,
    targetLabel: target.name,
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
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
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
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
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
