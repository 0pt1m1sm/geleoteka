import { recordMovement, binsForItem, type DbClientPort } from "@/lib/wms/public";
import { TENANT_KEY, defaultWarehouseId } from "@/lib/wms-host";

export interface AdjustResult {
  quantity: number;
  reserved: number;
  available: number;
}

/**
 * Reconcile a part's on-hand to an absolute `newQuantity` by writing an
 * ADJUSTMENT movement (delta = target − current) through the WMS chokepoint.
 * No-op (no movement) when the target equals the current on-hand.
 *
 * Pass a `$transaction` client so the read, the movement, and the negative
 * guard are atomic. THROWS when the applied movement would leave on-hand below
 * 0 or below `reserved` — the caller's transaction then rolls back, so no
 * partial write survives. `actorUserId` stamps the audit movement.
 */
export async function applyAdjustment(
  client: DbClientPort,
  partId: string,
  newQuantity: number,
  actorUserId: string | undefined,
  note?: string,
  idempotencyKey?: string,
  warehouseId?: string,
): Promise<AdjustResult> {
  warehouseId ??= await defaultWarehouseId(client);
  const si = (await client.stockItem.findUnique({
    where: { partId_warehouseId: { partId, warehouseId } },
    select: { quantity: true, reserved: true },
  })) as { quantity: number; reserved: number } | null;

  const currentQty = si?.quantity ?? 0;
  const reserved = si?.reserved ?? 0;
  const delta = newQuantity - currentQty;

  if (delta === 0) {
    return { quantity: currentQty, reserved, available: currentQty - reserved };
  }

  // The invariant placed ≤ on-hand: an ADJUSTMENT changes the aggregate without
  // touching bins, so lowering on-hand below what is physically placed would
  // create an impossible state (placed > on-hand). Bins are unaffected by this
  // movement, so the pre-read `placed` stays valid through the guard below.
  const { placed } = await binsForItem(client, partId, warehouseId, TENANT_KEY);

  const result = await recordMovement(client, {
    item: { itemId: partId, warehouseId },
    reason: "ADJUSTMENT",
    qty: delta,
    source: { type: "WarehouseAdjust", id: null },
    actorId: actorUserId,
    note: note ?? "Warehouse adjust",
    idempotencyKey,
    tenantKey: TENANT_KEY,
  });

  if (result.quantity < placed) {
    // Reducing on-hand below placed would strand stock in bins it no longer
    // covers — correct inventory at the bin/location instead. Throwing aborts the tx.
    throw new Error("PLACED_EXCEEDS_ONHAND");
  }
  if (result.quantity < 0 || result.quantity < result.reserved) {
    // Roll back: a concurrent CONSUMPTION between our read and apply could
    // drive on-hand below 0 / below reserved. Throwing aborts the tx.
    throw new Error("NEGATIVE_ON_HAND");
  }

  return { quantity: result.quantity, reserved: result.reserved, available: result.available };
}
