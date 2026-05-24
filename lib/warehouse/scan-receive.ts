import { recordMovement, placeStock, assertLocationUsable, type DbClientPort } from "@/lib/wms/public";
import { TENANT_KEY, STAGING_LOCATION, defaultWarehouseId } from "@/lib/wms-host";
import { applyReceive, type ReceiveResult } from "./receive";
import { OPEN_SUPPLIER_ORDER_STATUSES } from "./incoming";

/**
 * Scanner receiving core (host-side, transaction-driven). Two receipt paths,
 * both raising on-hand and placing into a staging/shelf cell in one tx:
 *  - order-backed: reuse applyReceive (CAS, order-status/landed-cost, putaway).
 *  - blind: a RECEIPT/ManualReceipt movement for goods with no supplier order.
 * Both guard the target location (blocked/inactive → LOCATION_BLOCKED).
 *
 * Pass a `$transaction` client so the guard + receipt + placement are atomic.
 */

const OPEN_STATUSES = OPEN_SUPPLIER_ORDER_STATUSES as readonly string[];

export interface ScanReceiveOrderInput {
  orderId: string;
  lineId: string;
  qty: number;
  /** The `receivedQuantity` the caller last saw — applyReceive's CAS token. */
  expectedReceived: number;
  location: string;
  actorId?: string;
}

/**
 * Receive a supplier-order PART line via the scanner. Enforces order
 * receivability SERVER-SIDE (status must be open) — the scanner UI filters to
 * open orders, but a direct action call must not be able to receive a DRAFT or
 * other non-open line. Then delegates to applyReceive (which owns the CAS,
 * RECEIPT movement, optional putaway, and order-status transition).
 */
export async function applyScanReceiveOrderLine(
  client: DbClientPort,
  input: ScanReceiveOrderInput,
): Promise<ReceiveResult> {
  const order = (await client.supplierOrder.findUnique({
    where: { id: input.orderId },
    select: { status: true },
  })) as { status: string } | null;
  if (!order) return { error: "Заказ не найден" };
  if (!OPEN_STATUSES.includes(order.status)) {
    return { error: "Заказ недоступен для приёмки" };
  }
  // Coerce a blank/whitespace cell to the staging default. Without this,
  // applyReceive raises stock + advances the order but its `location.trim()`
  // check skips placement, leaving goods unplaced instead of in ПРИЁМКА.
  const location = (input.location ?? "").trim() || STAGING_LOCATION;
  // Reject a blocked/inactive target before any stock change (applyReceive →
  // placeStock does not validate the location itself).
  await assertLocationUsable(client, location, await defaultWarehouseId(client), TENANT_KEY);
  return applyReceive(client, {
    orderId: input.orderId,
    lineId: input.lineId,
    qty: input.qty,
    expectedReceived: input.expectedReceived,
    location,
    actorId: input.actorId,
  });
}

export interface BlindReceiveInput {
  partId: string;
  qty: number;
  location: string;
  /** REQUIRED stable per-confirm key — dedupes both the movement and placement
   *  so a network retry never double-counts. */
  idempotencyKey: string;
  actorId?: string;
}

export interface BlindReceiveResult {
  applied: boolean;
  quantity: number;
}

/**
 * Blind receipt for goods with no supplier order (gray import). Raises on-hand
 * via a RECEIPT movement under a distinct `ManualReceipt` source, then places
 * the units — but ONLY when the movement was newly applied. On a replay
 * (same idempotencyKey) recordMovement no-ops; placing unconditionally would
 * move unrelated unplaced stock and desync the bin from on-hand.
 */
export async function applyBlindReceive(
  client: DbClientPort,
  input: BlindReceiveInput,
): Promise<BlindReceiveResult> {
  const { partId, qty, idempotencyKey, actorId } = input;
  // Coerce a blank/whitespace cell to the staging default — never place into a
  // normalized empty-string bin.
  const location = (input.location ?? "").trim() || STAGING_LOCATION;
  const warehouseId = await defaultWarehouseId(client);
  await assertLocationUsable(client, location, warehouseId, TENANT_KEY);
  const mv = await recordMovement(client, {
    item: { itemId: partId, warehouseId },
    reason: "RECEIPT",
    qty,
    source: { type: "ManualReceipt", id: idempotencyKey },
    idempotencyKey,
    actorId,
    tenantKey: TENANT_KEY,
  });
  if (mv.applied) {
    await placeStock(client, {
      itemId: partId,
      warehouseId,
      location,
      qty,
      actorId,
      idempotencyKey: `${idempotencyKey}:place`,
      tenantKey: TENANT_KEY,
    });
  }
  return { applied: mv.applied, quantity: mv.quantity };
}

export interface OpenOrderLine {
  orderId: string;
  lineId: string;
  orderNumber: string | null;
  supplierName: string;
  ordered: number;
  received: number;
  remaining: number;
}

/**
 * Open, not-fully-received PART lines for a part across open supplier orders —
 * the candidates the scanner offers the worker to receive against.
 */
export async function openOrderLinesForPart(
  client: DbClientPort,
  partId: string,
): Promise<OpenOrderLine[]> {
  // The generated Prisma client is @ts-nocheck; through the typed `db` singleton
  // the enum-array filter and the relation-select result shape don't satisfy the
  // strict overloads. Call findMany via a loose signature (same pattern as
  // incoming.ts's groupBy cast) so the query arg + result are untyped here.
  const findMany = client.supplierOrderItem.findMany as unknown as (args: unknown) => Promise<
    Array<{
      id: string;
      orderId: string;
      quantity: number;
      receivedQuantity: number;
      order: { orderNumber: string | null; supplier: { name: string | null } | null };
    }>
  >;
  const rows = await findMany({
    where: {
      partId,
      type: "PART",
      order: { status: { in: OPEN_STATUSES } },
    },
    select: {
      id: true,
      orderId: true,
      quantity: true,
      receivedQuantity: true,
      order: { select: { orderNumber: true, supplier: { select: { name: true } } } },
    },
    orderBy: { order: { orderDate: "asc" } },
  });

  // `receivedQuantity < quantity` is filtered in JS, not the WHERE: Prisma has no
  // native column-to-column comparison and the set is already small (only THIS
  // part's lines on open orders — typically 1–3 rows), so the over-fetch is bounded.
  return rows
    .filter((r) => r.receivedQuantity < r.quantity)
    .map((r) => ({
      orderId: r.orderId,
      lineId: r.id,
      orderNumber: r.order.orderNumber,
      supplierName: r.order.supplier?.name ?? "—",
      ordered: r.quantity,
      received: r.receivedQuantity,
      remaining: r.quantity - r.receivedQuantity,
    }));
}
