import type { DbClientPort } from "@/lib/wms/public";
import { OPEN_SUPPLIER_ORDER_STATUSES } from "./incoming";

/**
 * The storekeeper's receiving queue: open supplier orders with their PART-line
 * progress. WORKER-SAFE BY CONSTRUCTION — the select carries no cost/price/
 * profit fields, so the shaped rows can be serialized to a WAREHOUSE_WORKER
 * page without leaking purchase prices (Goal Verification Truth 1).
 */
export interface ReceivingQueueRow {
  orderId: string;
  orderNumber: string | null;
  supplierName: string;
  orderDate: Date;
  estimatedArrival: Date | null;
  status: string;
  /** Σ quantity over PART lines. */
  orderedTotal: number;
  /** Σ receivedQuantity over PART lines. */
  receivedTotal: number;
  /** estimatedArrival is in the past and the order is still not fully received. */
  overdue: boolean;
}

interface QueueSourceRow {
  id: string;
  orderNumber: string | null;
  orderDate: Date;
  estimatedArrival: Date | null;
  status: string;
  supplier: { name: string | null } | null;
  items: Array<{ quantity: number; receivedQuantity: number }>;
}

/**
 * Open orders shaped for the receiving queue, overdue deliveries first, then
 * oldest order first. One query, no N+1. `now` is injected for testability.
 */
export async function receivingQueue(client: DbClientPort, now: Date): Promise<ReceivingQueueRow[]> {
  // Relation-select on the @ts-nocheck generated client — loose call signature,
  // same pattern as incoming.ts / scan-receive.ts.
  const findMany = (client as unknown as { supplierOrder: { findMany: (args: unknown) => Promise<QueueSourceRow[]> } })
    .supplierOrder.findMany;
  const rows = await findMany({
    where: { status: { in: [...OPEN_SUPPLIER_ORDER_STATUSES] } },
    select: {
      id: true,
      orderNumber: true,
      orderDate: true,
      estimatedArrival: true,
      status: true,
      supplier: { select: { name: true } },
      items: { where: { type: "PART" }, select: { quantity: true, receivedQuantity: true } },
    },
    orderBy: { orderDate: "asc" },
  });

  const shaped = rows.map((r): ReceivingQueueRow => {
    const orderedTotal = r.items.reduce((s, l) => s + l.quantity, 0);
    const receivedTotal = r.items.reduce((s, l) => s + l.receivedQuantity, 0);
    return {
      orderId: r.id,
      orderNumber: r.orderNumber,
      supplierName: r.supplier?.name ?? "—",
      orderDate: r.orderDate,
      estimatedArrival: r.estimatedArrival,
      status: r.status,
      orderedTotal,
      receivedTotal,
      overdue:
        r.estimatedArrival !== null && new Date(r.estimatedArrival).getTime() < now.getTime() && receivedTotal < orderedTotal,
    };
  });

  // An open order with no PART lines (FEE/SERVICE only) has nothing to receive —
  // "0 из 0" is noise for the storekeeper.
  return shaped
    .filter((r) => r.orderedTotal > 0)
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
    });
}
