"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { consumeApprovedEstimateParts } from "@/lib/fulfillment/consume-parts";
import { isFullyPacked } from "@/lib/warehouse/pack";
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
  // CANCELLED is excluded as a source status: a cancelled order that is later
  // re-marked SHIPPED must NOT auto-consume stock (it was intentionally voided).
  // Consumption belongs to the normal PROCESSING → dispatched flow only.
  const enteringDispatched =
    DISPATCHED.has(newStatus) &&
    prior !== null &&
    !DISPATCHED.has(prior.status) &&
    prior.status !== "CANCELLED";

  // Skip re-consuming on dispatch ONLY when the order is FULLY fulfilled already
  // — retail sales consume at create time (source orderId:partId), and Phase 4b
  // packing consumes each picked CRM line (source orderId:estimateLineId). A
  // coarse "any CONSUMPTION movement exists" guard would wrongly skip the dispatch
  // top-up for a PARTIALLY-packed CRM order, leaving its remaining lines
  // un-consumed while marking it shipped. isFullyPacked is line-precise (unified:
  // retail by partId, CRM by estimate-line id), so a partially-packed order still
  // tops up its remaining APPROVED-estimate lines here. Each already-consumed line
  // is an idempotent per-line no-op (consumeStock → recordMovement's
  // (tenant, source, reason) unique index), which is the real correctness backstop.
  const fullyConsumed = enteringDispatched && (await isFullyPacked(db, orderId));

  await db.$transaction(async (tx) => {
    await tx.partShipment.update({
      where: { id: orderId },
      data: {
        status: newStatus as "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELLED",
      },
    });
    if (enteringDispatched && !fullyConsumed && prior) {
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
