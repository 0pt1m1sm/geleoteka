import { recordMovement, placeStock, removeFromBin, WmsError, type DbClientPort } from "@/lib/wms/public";
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
  /** Physical warehouse to receive into. Omitted → the tenant default (MAIN). */
  warehouseId?: string;
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
  const warehouseId = input.warehouseId ?? (await defaultWarehouseId(client));

  // Event-unique source id. The old cumulative-count id (`…:${newReceived}`) was
  // collision-free only while receivedQuantity was monotonic — undo (сторно)
  // breaks monotonicity, so re-receiving up to a previously-seen count would
  // collide with the source-triple unique index and recordMovement would no-op
  // (applied:false), silently desyncing on-hand from receivedQuantity. The CAS
  // above is the sole dedup authority on this path (a replay fails closed before
  // any movement); the random suffix serves only the audit ledger's uniqueness.
  const mv = await recordMovement(client, {
    item: { itemId: line.partId, warehouseId },
    reason: "RECEIPT",
    qty,
    source: {
      type: "SupplierOrder",
      id: `${orderId}:${lineId}:${expectedReceived}->${newReceived}#${crypto.randomUUID()}`,
    },
    actorId,
    tenantKey: TENANT_KEY,
  });
  // Defense-in-depth: a no-op here means the ledger refused the write while the
  // CAS already advanced — abort so the caller's transaction rolls everything back.
  if (!mv.applied) throw WmsError.duplicateOperation();

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

export interface ApplyUndoReceiveInput {
  orderId: string;
  lineId: string;
  /** Units to reverse (positive). */
  qty: number;
  /** The `receivedQuantity` the caller last saw — the compare-and-set token. */
  expectedReceived: number;
  /** Bin to pull the reversed units out of. Blank/omitted → skip bin removal
   *  (legacy receipts that were never placed). */
  location?: string | null;
  actorId?: string;
  warehouseId?: string;
}

/**
 * Сторно приёмки: reverse `qty` of an erroneously received PART line. Pass a
 * `$transaction` client — the CAS decrement, the optional bin removal, the
 * RECEIPT_REVERSAL movement and the status downgrade are one atomic unit.
 *
 * Guards (all fail closed): terminal orders (COMPLETED/CANCELLED) are closed —
 * RECEIVED is deliberately undoable, that's the whole point (an over-receipt is
 * usually noticed right after the order auto-completes); qty must not exceed the
 * CAS token; on-hand must not go below zero (stock already consumed) nor below
 * the reserved hold. Bin removal runs BEFORE the aggregate drop so Σbins ≤
 * on-hand holds mid-transaction; a short bin throws INSUFFICIENT_BIN and rolls
 * the whole undo back. The reversal movement's `applied` flag is asserted —
 * a ledger no-op alongside an applied CAS would strand stock (critic M3).
 *
 * Status: full undo of everything → ORDERED (the true pre-receiving status is
 * unknowable without replaying history — Autonomous Decision 3); some received →
 * PARTIALLY_RECEIVED; every line still full (undoing an over-receipt) → keep.
 * `receivedAt` is cleared when the order leaves RECEIVED.
 */
export async function applyUndoReceive(
  client: DbClientPort,
  input: ApplyUndoReceiveInput,
): Promise<ReceiveResult> {
  const { orderId, lineId, qty, expectedReceived, actorId } = input;

  const line = (await client.supplierOrderItem.findUnique({
    where: { id: lineId },
    select: { id: true, orderId: true, partId: true, type: true, quantity: true, receivedQuantity: true },
  })) as
    | { id: string; orderId: string; partId: string | null; type: string; quantity: number; receivedQuantity: number }
    | null;

  if (!line || line.orderId !== orderId) return { error: "Позиция не найдена" };
  if (line.type !== "PART" || !line.partId) return { error: "Можно сторнировать только запчасти" };
  if (qty > expectedReceived) return { error: "Нельзя сторнировать больше, чем принято" };

  const order = (await client.supplierOrder.findUnique({
    where: { id: orderId },
    select: { status: true },
  })) as { status: SupplierOrderStatus } | null;
  if (!order) return { error: "Заказ не найден" };
  if (order.status === "COMPLETED" || order.status === "CANCELLED") {
    return { error: "Заказ закрыт для изменений" };
  }

  const warehouseId = input.warehouseId ?? (await defaultWarehouseId(client));

  // Stock guards: the reversal must not drive on-hand negative (units already
  // consumed) or below the reserved hold (mirrors lib/warehouse/adjust.ts).
  const si = (await client.stockItem.findUnique({
    where: { partId_warehouseId: { partId: line.partId, warehouseId } },
    select: { quantity: true, reserved: true },
  })) as { quantity: number; reserved: number } | null;
  const onHand = si?.quantity ?? 0;
  const reserved = si?.reserved ?? 0;
  if (onHand - qty < 0) return { error: "Нельзя сторнировать: остаток уже списан" };
  if (onHand - qty < reserved) return { error: "Нельзя сторнировать: остаток зарезервирован" };

  // Compare-and-set — same discipline as applyReceive, in the decrement direction.
  const cas = await client.supplierOrderItem.updateMany({
    where: { id: lineId, orderId, receivedQuantity: expectedReceived },
    data: { receivedQuantity: { decrement: qty } },
  });
  if (cas.count === 0) {
    return { error: "Позиция изменилась — обновите страницу", stale: true };
  }

  const newReceived = expectedReceived - qty;

  // Bin first (bin → unplaced), then the aggregate drop below.
  const location = (input.location ?? "").trim();
  if (location) {
    await removeFromBin(client, {
      itemId: line.partId,
      warehouseId,
      location,
      qty,
      actorId,
      note: `Сторно приёмки ${orderId}:${lineId}`,
      tenantKey: TENANT_KEY,
    });
  }

  const mv = await recordMovement(client, {
    item: { itemId: line.partId, warehouseId },
    reason: "RECEIPT_REVERSAL",
    qty,
    source: {
      type: "SupplierOrderUndo",
      id: `${orderId}:${lineId}:${expectedReceived}->${newReceived}#${crypto.randomUUID()}`,
    },
    actorId,
    tenantKey: TENANT_KEY,
  });
  if (!mv.applied) throw WmsError.duplicateOperation();
  // Post-image re-check: the pre-image reserved guard above can be raced by a
  // concurrent RESERVATION; recordMovement returns the post-delta counters, so
  // reject (→ tx rollback) when the reversal actually left on-hand below the
  // hold (security-review hardening — no physical loss either way, the DB
  // CHECK floors quantity at 0).
  if (mv.quantity < mv.reserved) throw WmsError.reconcileBlocked(line.partId);

  const lines = (await client.supplierOrderItem.findMany({
    where: { orderId, type: "PART" },
    select: { quantity: true, receivedQuantity: true },
  })) as Array<{ quantity: number; receivedQuantity: number }>;
  const anyReceived = lines.some((l) => l.receivedQuantity > 0);
  const allFull = lines.length > 0 && lines.every((l) => l.receivedQuantity >= l.quantity);
  const next: SupplierOrderStatus = allFull ? order.status : anyReceived ? "PARTIALLY_RECEIVED" : "ORDERED";
  if (next !== order.status) {
    await client.supplierOrder.update({
      where: { id: orderId },
      data: { status: next, ...(order.status === "RECEIVED" ? { receivedAt: null } : {}) },
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
