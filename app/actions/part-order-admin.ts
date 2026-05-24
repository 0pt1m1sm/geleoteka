"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { consumeApprovedEstimateParts } from "@/lib/fulfillment/consume-parts";
import { actorId } from "@/lib/wms-host";

const DISPATCHED = new Set(["SHIPPED", "COMPLETED"]);

export async function updatePartOrderStatus(
  orderId: string,
  newStatus: string
): Promise<void> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  // Consume parts when a shipment first enters a dispatched state. Retail orders
  // (DRAFT estimate) consumed at sale time → no APPROVED estimate → safe no-op.
  const prior = (await db.partShipment.findUnique({
    where: { id: orderId },
    select: { status: true, dealId: true },
  })) as { status: string; dealId: string } | null;
  const enteringDispatched =
    DISPATCHED.has(newStatus) && prior !== null && !DISPATCHED.has(prior.status);

  // Fast-path guard against double-consumption: a retail sale (createPartOrder)
  // already consumed its parts at order-create time with a PartShipment source.
  // If any CONSUMPTION movement already exists for this shipment, the parts left
  // stock at sale — skip re-consuming on dispatch, regardless of estimate state.
  // NOTE: this count is read OUTSIDE the tx, so it is a TOCTOU optimization, not
  // the correctness backstop. Stock correctness is guaranteed by consumeStock →
  // recordMovement's (tenant, source, reason) unique index (a duplicate is an
  // idempotent no-op that deducts nothing). Do NOT remove that idempotency
  // believing this guard suffices.
  const alreadyConsumed =
    enteringDispatched &&
    (await db.stockMovement.count({
      where: { sourceType: "PartShipment", sourceId: { startsWith: `${orderId}:` }, reason: "CONSUMPTION" },
    })) > 0;

  await db.$transaction(async (tx) => {
    await tx.partShipment.update({
      where: { id: orderId },
      data: {
        status: newStatus as "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELLED",
      },
    });
    if (enteringDispatched && !alreadyConsumed && prior) {
      await consumeApprovedEstimateParts(tx, {
        dealId: prior.dealId,
        sourceType: "PartShipment",
        sourceId: orderId,
        actorId: actorId(session),
      });
    }
  });

  // Notify customer if order has an associated user
  const order = await db.partShipment.findUnique({
    where: { id: orderId },
    select: { userId: true, id: true },
  });

  if (order && (order as Record<string, unknown>).userId) {
    const statusLabels: Record<string, string> = {
      PROCESSING: "В обработке",
      SHIPPED: "Отправлен",
      COMPLETED: "Завершён",
      CANCELLED: "Отменён",
    };

    await db.notification.create({
      data: {
        userId: (order as Record<string, unknown>).userId as string,
        type: "STATUS_CHANGE",
        message: `Статус вашего заказа запчастей изменён: ${statusLabels[newStatus] ?? newStatus}`,
        metadata: { orderId: orderId },
      },
    });
  }
}
