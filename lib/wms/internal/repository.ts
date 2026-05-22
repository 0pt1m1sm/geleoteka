// The ONLY file in the WMS core that touches a Prisma client. The client is
// INJECTED by the caller (the host passes its `db` singleton or a `$transaction`
// client via lib/wms-host). The core never imports `@/lib/db`. Importing the
// generated Prisma *types* is the single documented bridge (see design §1).
import type { PrismaClient } from "@/app/generated/prisma/client";
import type { MovementReason, StockItemView } from "../public/types";

/** A Prisma client OR a `$transaction` tx client — both expose the delegates we use. */
export type DbClientPort =
  | PrismaClient
  | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

interface StockItemRow {
  id: string;
  quantity: number;
  reserved: number;
}

/** Postgres unique-violation guard (Prisma P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** Find the StockItem for an external itemId (= partId today), creating one if absent. */
export async function ensureStockItem(
  client: DbClientPort,
  partId: string,
  tenantKey: string,
): Promise<StockItemRow> {
  const existing = (await client.stockItem.findUnique({
    where: { partId },
    select: { id: true, quantity: true, reserved: true },
  })) as StockItemRow | null;
  if (existing) return existing;

  return (await client.stockItem.create({
    data: { partId, tenantKey },
    select: { id: true, quantity: true, reserved: true },
  })) as StockItemRow;
}

/** Insert the audit movement. Throws P2002 on a duplicate idempotency triple. */
export async function insertMovement(
  client: DbClientPort,
  row: {
    itemId: string;
    reason: MovementReason;
    quantityDelta: number;
    reservedDelta: number;
    sourceType: string;
    sourceId: string | null;
    actorUserId: string | null;
    note: string | null;
    tenantKey: string;
  },
): Promise<void> {
  await client.stockMovement.create({ data: row });
}

/** Apply signed deltas to the StockItem counters; returns the new values. */
export async function applyDeltas(
  client: DbClientPort,
  stockItemId: string,
  quantityDelta: number,
  reservedDelta: number,
): Promise<{ quantity: number; reserved: number }> {
  return (await client.stockItem.update({
    where: { id: stockItemId },
    data: {
      quantity: { increment: quantityDelta },
      reserved: { increment: reservedDelta },
    },
    select: { quantity: true, reserved: true },
  })) as { quantity: number; reserved: number };
}

/** Resolve a barcode/gtin to a stock view. Article resolution is host-side. */
export async function findViewByCode(
  client: DbClientPort,
  code: string,
  tenantKey: string,
): Promise<StockItemView | null> {
  const row = (await client.stockItem.findFirst({
    where: { tenantKey, OR: [{ barcode: code }, { gtin: code }] },
    select: { partId: true, barcode: true, quantity: true, reserved: true },
  })) as { partId: string; barcode: string | null; quantity: number; reserved: number } | null;
  if (!row) return null;
  return {
    itemId: row.partId,
    barcode: row.barcode,
    quantity: row.quantity,
    reserved: row.reserved,
    available: row.quantity - row.reserved,
  };
}

// ── Bin placement layer ─────────────────────────────────────────────────────

/** Sum of all bin quantities for a StockItem (by StockItem.id). */
export async function sumBins(client: DbClientPort, stockItemId: string, tenantKey: string): Promise<number> {
  const agg = (await client.stockBin.aggregate({
    where: { tenantKey, itemId: stockItemId },
    _sum: { quantity: true },
  })) as { _sum: { quantity: number | null } };
  return agg._sum.quantity ?? 0;
}

/** All non-empty bins for a StockItem, as { location, quantity }. */
export async function findBinsForItem(
  client: DbClientPort,
  stockItemId: string,
  tenantKey: string,
): Promise<Array<{ location: string; quantity: number }>> {
  return (await client.stockBin.findMany({
    where: { tenantKey, itemId: stockItemId, quantity: { gt: 0 } },
    select: { location: true, quantity: true },
    orderBy: { location: "asc" },
  })) as Array<{ location: string; quantity: number }>;
}

/** Items (by external partId) stored in a location, with quantity. */
export async function findItemsInLocation(
  client: DbClientPort,
  location: string,
  tenantKey: string,
): Promise<Array<{ itemId: string; quantity: number }>> {
  const rows = (await client.stockBin.findMany({
    where: { tenantKey, location, quantity: { gt: 0 } },
    select: { quantity: true, item: { select: { partId: true } } },
    orderBy: { quantity: "desc" },
  })) as Array<{ quantity: number; item: { partId: string } }>;
  return rows.map((r) => ({ itemId: r.item.partId, quantity: r.quantity }));
}

/** Create-or-increment a bin by a positive delta (putaway / transfer-in). */
export async function incrementBin(
  client: DbClientPort,
  stockItemId: string,
  location: string,
  qty: number,
  tenantKey: string,
): Promise<void> {
  await client.stockBin.upsert({
    where: { tenantKey_itemId_location: { tenantKey, itemId: stockItemId, location } },
    create: { itemId: stockItemId, location, quantity: qty, tenantKey },
    update: { quantity: { increment: qty } },
  });
}

/** Conditionally decrement a bin ONLY if it still holds ≥ qty. Returns true
 *  when applied. No silent clamp — the caller throws when this returns false,
 *  so the audit never records a delta that wasn't applied. */
export async function decrementBinIfEnough(
  client: DbClientPort,
  stockItemId: string,
  location: string,
  qty: number,
  tenantKey: string,
): Promise<boolean> {
  const res = (await client.stockBin.updateMany({
    where: { tenantKey, itemId: stockItemId, location, quantity: { gte: qty } },
    data: { quantity: { decrement: qty } },
  })) as { count: number };
  return res.count === 1;
}

/** Insert a bin-movement audit row (PLACE / TRANSFER / REMOVE). */
export async function insertBinMovement(
  client: DbClientPort,
  row: {
    itemId: string;
    reason: "PLACE" | "TRANSFER" | "REMOVE";
    fromLocation: string | null;
    toLocation: string | null;
    quantity: number;
    actorUserId: string | null;
    note: string | null;
    tenantKey: string;
  },
): Promise<void> {
  await client.stockBinMovement.create({ data: row });
}

/** Resolve a stock view by external itemId (= partId). */
export async function findViewByItemId(
  client: DbClientPort,
  itemId: string,
): Promise<StockItemView | null> {
  const row = (await client.stockItem.findUnique({
    where: { partId: itemId },
    select: { partId: true, barcode: true, quantity: true, reserved: true },
  })) as { partId: string; barcode: string | null; quantity: number; reserved: number } | null;
  if (!row) return null;
  return {
    itemId: row.partId,
    barcode: row.barcode,
    quantity: row.quantity,
    reserved: row.reserved,
    available: row.quantity - row.reserved,
  };
}
