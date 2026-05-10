"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/utils";

/**
 * Statuses a master may set on their own assigned orders. Excludes
 * INVOICED/PAID/CLOSED (financial — manager) and CANCELLED (manager).
 * Also excludes ESTIMATE/APPROVED — that's the pre-work phase owned
 * by the manager / customer.
 */
const MASTER_ALLOWED_STATUSES = [
  "IN_PROGRESS",
  "AWAITING_PARTS",
  "QC",
  "READY",
] as const;

type MasterAllowedStatus = (typeof MASTER_ALLOWED_STATUSES)[number];

function isMasterAllowed(s: string): s is MasterAllowedStatus {
  return (MASTER_ALLOWED_STATUSES as readonly string[]).includes(s);
}

/**
 * Status update by a master. Verifies the order is assigned to the
 * caller AND the new status is in the master-allowed set. Customers
 * still get the SMS + notification — same downstream side-effects as
 * the admin action so the experience is consistent.
 */
export async function updateRepairOrderStatusByMaster(
  repairOrderId: string,
  newStatus: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Не авторизованы" };
  // Admins/managers viewing /master can also change status — they have
  // a wider allowed set elsewhere, but here the same master-scoped
  // window applies for consistency.
  const role = session.permissionRole;
  if (role !== "MASTER" && role !== "MANAGER" && role !== "ADMIN") {
    return { ok: false, error: "Нет доступа" };
  }
  if (!isMasterAllowed(newStatus)) {
    return {
      ok: false,
      error: "Этот статус задаёт менеджер. Передайте заказ-наряд на расчёт/закрытие.",
    };
  }

  const ro = (await db.repairOrder.findUnique({
    where: { id: repairOrderId },
    select: { masterUserId: true, user: { select: { id: true, phone: true } } },
  })) as
    | { masterUserId: string | null; user: { id: string; phone: string } }
    | null;
  if (!ro) return { ok: false, error: "Заказ-наряд не найден" };

  const isOwnAssignment = ro.masterUserId === session.id;
  if (!isOwnAssignment && role === "MASTER") {
    return { ok: false, error: "Этот заказ-наряд назначен другому мастеру" };
  }

  await db.repairOrder.update({
    where: { id: repairOrderId },
    data: { status: newStatus },
  });

  const label = REPAIR_ORDER_STATUS_LABELS[newStatus] ?? newStatus;
  await db.notification.create({
    data: {
      userId: ro.user.id,
      type: "STATUS_CHANGE",
      message: `Статус вашего заказ-наряда изменён: ${label}`,
      metadata: { repairOrderId },
    },
  });
  // Fire-and-log SMS — failure shouldn't block the status update.
  void import("@/lib/sms")
    .then(({ sendStatusChange }) => sendStatusChange(ro.user.phone, label))
    .catch((err) => console.error("[master status sms]", err));

  revalidatePath(`/master/orders/${repairOrderId}`);
  revalidatePath("/master");
  return { ok: true };
}
