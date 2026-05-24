import { recordMovement, placeStock, type DbClientPort } from "@/lib/wms/public";
import { TENANT_KEY, defaultWarehouseId } from "@/lib/wms-host";

export type SupplierOrderStatus =
  | "DRAFT"
  | "ORDERED"
  | "IN_TRANSIT"
  | "CUSTOMS"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "COMPLETED"
  | "CANCELLED";

export interface ReceiveResult {
  error: string | null;
  /** True when the compare-and-set found a stale `expectedReceived` (nothing applied). */
  stale?: boolean;
  received?: number;
  ordered?: number;
  overReceived?: boolean;
  status?: SupplierOrderStatus;
}

export interface ApplyReceiveInput {
  orderId: string;
  lineId: string;
  qty: number;
  /** The `receivedQuantity` the caller last saw — the compare-and-set token. */
  expectedReceived: number;
  location?: string | null;
  actorId?: string;
}

/**
 * The two statuses owned exclusively by receiving — they are set automatically
 * as lines are received and must never be set by the manual status changer
 * (which would otherwise be a path to mutate a closed order without a RECEIPT).
 */
export function isReceivingStatus(status: string): boolean {
  return status === "PARTIALLY_RECEIVED" || status === "RECEIVED";
}

/**
 * Auto status from the order's PART lines. `RECEIVED` when every PART line is
 * received-in-full, `PARTIALLY_RECEIVED` when some (but not all) is received,
 * otherwise the current status. Never auto-touches the terminal manual states
 * (`COMPLETED`/`CANCELLED`).
 */
export function computeReceivingStatus(
  lines: Array<{ quantity: number; receivedQuantity: number }>,
  current: SupplierOrderStatus,
): SupplierOrderStatus {
  if (current === "COMPLETED" || current === "CANCELLED") return current;
  if (lines.length === 0) return current;
  const allFull = lines.every((l) => l.receivedQuantity >= l.quantity);
  if (allFull) return "RECEIVED";
  const anyReceived = lines.some((l) => l.receivedQuantity > 0);
  if (anyReceived) return "PARTIALLY_RECEIVED";
  return current;
}

/**
 * Receive `qty` of a supplier-order PART line incrementally. Pass a
 * `$transaction` client so the compare-and-set, the RECEIPT, the optional
 * putaway, and the status update are atomic.
 *
 * Replay/concurrency guard: the RECEIPT is applied only after an atomic
 * conditional `updateMany({ where: { id, receivedQuantity: expectedReceived } })`.
 * `count === 0` means a stale/replayed/concurrent submit — the receive fails
 * closed (`{ stale: true }`) before any movement. THROWS only for genuine WMS /
 * DB errors (e.g. an invalid putaway location); the caller maps those to a
 * structured error and the transaction rolls back.
 */
export async function applyReceive(client: DbClientPort, input: ApplyReceiveInput): Promise<ReceiveResult> {
  const { orderId, lineId, qty, expectedReceived, location, actorId } = input;

  const line = (await client.supplierOrderItem.findUnique({
    where: { id: lineId },
    select: { id: true, orderId: true, partId: true, type: true, quantity: true, receivedQuantity: true },
  })) as
    | { id: string; orderId: string; partId: string | null; type: string; quantity: number; receivedQuantity: number }
    | null;

  if (!line || line.orderId !== orderId) return { error: "Позиция не найдена" };
  if (line.type !== "PART" || !line.partId) return { error: "Можно принимать только запчасти" };

  // Server-side terminal guard: a terminal order is closed for receiving. The UI
  // renders read-only for these statuses, but that is only a client guard — a
  // stale page or a direct action call must NOT raise stock on a closed order.
  // Read inside the same tx, before the CAS. (The receive that COMPLETES an order
  // still sees a non-terminal status here, then sets RECEIVED at the end.)
  const order = (await client.supplierOrder.findUnique({
    where: { id: orderId },
    select: { status: true },
  })) as { status: SupplierOrderStatus } | null;
  if (!order) return { error: "Заказ не найден" };
  if (order.status === "RECEIVED" || order.status === "COMPLETED" || order.status === "CANCELLED") {
    return { error: "Заказ закрыт для приёмки" };
  }

  // Compare-and-set: only one of N racing/replayed calls can match the expected value.
  const cas = await client.supplierOrderItem.updateMany({
    where: { id: lineId, orderId, receivedQuantity: expectedReceived },
    data: { receivedQuantity: { increment: qty } },
  });
  if (cas.count === 0) {
    return { error: "Позиция изменилась — обновите страницу", stale: true };
  }

  const newReceived = expectedReceived + qty;
  const warehouseId = await defaultWarehouseId(client);

  await recordMovement(client, {
    item: { itemId: line.partId, warehouseId },
    reason: "RECEIPT",
    qty,
    source: { type: "SupplierOrder", id: `${orderId}:${lineId}:${newReceived}` },
    actorId,
    tenantKey: TENANT_KEY,
  });

  if (location && location.trim()) {
    await placeStock(client, { itemId: line.partId, warehouseId, location, qty, actorId, tenantKey: TENANT_KEY });
  }

  const lines = (await client.supplierOrderItem.findMany({
    where: { orderId, type: "PART" },
    select: { quantity: true, receivedQuantity: true },
  })) as Array<{ quantity: number; receivedQuantity: number }>;
  // Reuse the status read from the terminal guard above (still current within this tx).
  const current = order.status;
  const next = computeReceivingStatus(lines, current);
  if (next !== current) {
    await client.supplierOrder.update({
      where: { id: orderId },
      data: { status: next, ...(next === "RECEIVED" ? { receivedAt: new Date() } : {}) },
    });
  }

  return {
    error: null,
    received: newReceived,
    ordered: line.quantity,
    overReceived: newReceived > line.quantity,
    status: next,
  };
}
