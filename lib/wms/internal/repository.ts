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

/** Find the StockItem for an external itemId (= partId today) in a warehouse,
 *  creating one if absent. A stock row is keyed by (partId, warehouseId). */
export async function ensureStockItem(
  client: DbClientPort,
  partId: string,
  tenantKey: string,
  warehouseId: string,
): Promise<StockItemRow> {
  const existing = (await client.stockItem.findUnique({
    where: { partId_warehouseId: { partId, warehouseId } },
    select: { id: true, quantity: true, reserved: true },
  })) as StockItemRow | null;
  if (existing) return existing;

  return (await client.stockItem.create({
    data: { partId, tenantKey, warehouseId },
    select: { id: true, quantity: true, reserved: true },
  })) as StockItemRow;
}

/** Insert the audit movement. Throws P2002 on a duplicate source-triple OR a
 *  duplicate (tenantKey, idempotencyKey) — the caller disambiguates which. */
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
    idempotencyKey: string | null;
    warehouseId: string;
    tenantKey: string;
  },
): Promise<void> {
  await client.stockMovement.create({ data: row });
}

/** Identity of a prior movement claimed by an idempotency key (for collision
 *  disambiguation: same payload → idempotent no-op; different → key reuse). */
export async function findMovementByKey(
  client: DbClientPort,
  tenantKey: string,
  idempotencyKey: string,
): Promise<{
  itemId: string;
  reason: MovementReason;
  quantityDelta: number;
  reservedDelta: number;
  sourceType: string;
  sourceId: string | null;
} | null> {
  return (await client.stockMovement.findUnique({
    where: { tenantKey_idempotencyKey: { tenantKey, idempotencyKey } },
    select: {
      itemId: true,
      reason: true,
      quantityDelta: true,
      reservedDelta: true,
      sourceType: true,
      sourceId: true,
    },
  })) as {
    itemId: string;
    reason: MovementReason;
    quantityDelta: number;
    reservedDelta: number;
    sourceType: string;
    sourceId: string | null;
  } | null;
}

/** True when a movement already exists for this (tenant, source, reason) triple.
 *  Lets a higher-level op short-circuit BEFORE the insert that would otherwise
 *  raise P2002 — a caught P2002 aborts a composed caller transaction, which would
 *  break a multi-line loop (e.g. an RO close over already-picked lines). */
export async function movementExistsForSource(
  client: DbClientPort,
  tenantKey: string,
  sourceType: string,
  sourceId: string,
  reason: MovementReason,
  warehouseId: string,
): Promise<boolean> {
  const row = (await client.stockMovement.findFirst({
    where: { tenantKey, sourceType, sourceId, reason, warehouseId },
    select: { id: true },
  })) as { id: string } | null;
  return row !== null;
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
  warehouseId: string,
): Promise<StockItemView | null> {
  const row = (await client.stockItem.findFirst({
    where: { tenantKey, warehouseId, OR: [{ barcode: code }, { gtin: code }] },
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
  warehouseId: string,
): Promise<Array<{ itemId: string; quantity: number }>> {
  const rows = (await client.stockBin.findMany({
    where: { tenantKey, warehouseId, location, quantity: { gt: 0 } },
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
  warehouseId: string,
): Promise<void> {
  await client.stockBin.upsert({
    where: { tenantKey_itemId_location: { tenantKey, itemId: stockItemId, location } },
    create: { itemId: stockItemId, location, quantity: qty, tenantKey, warehouseId },
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

/** Insert a bin-movement audit row (PLACE / TRANSFER / REMOVE / PICK). Throws
 *  P2002 on a duplicate (tenantKey, idempotencyKey) when a key is supplied. */
export async function insertBinMovement(
  client: DbClientPort,
  row: {
    itemId: string;
    reason: "PLACE" | "TRANSFER" | "REMOVE" | "PICK";
    fromLocation: string | null;
    toLocation: string | null;
    quantity: number;
    actorUserId: string | null;
    note: string | null;
    idempotencyKey: string | null;
    tenantKey: string;
  },
): Promise<void> {
  await client.stockBinMovement.create({ data: row });
}

/** Non-empty bins for a StockItem, ordered OLDEST-first (createdAt asc) — the
 *  FIFO order bin-aware consumption drains. Distinct from findBinsForItem (which
 *  orders by location for display). */
export async function findBinsOldestFirst(
  client: DbClientPort,
  stockItemId: string,
  tenantKey: string,
): Promise<Array<{ location: string; quantity: number }>> {
  return (await client.stockBin.findMany({
    where: { tenantKey, itemId: stockItemId, quantity: { gt: 0 } },
    select: { location: true, quantity: true },
    orderBy: { createdAt: "asc" },
  })) as Array<{ location: string; quantity: number }>;
}

/** Identity of a prior bin-movement claimed by an idempotency key. */
export async function findBinMovementByKey(
  client: DbClientPort,
  tenantKey: string,
  idempotencyKey: string,
): Promise<{
  itemId: string;
  reason: "PLACE" | "TRANSFER" | "REMOVE";
  fromLocation: string | null;
  toLocation: string | null;
  quantity: number;
} | null> {
  return (await client.stockBinMovement.findUnique({
    where: { tenantKey_idempotencyKey: { tenantKey, idempotencyKey } },
    select: { itemId: true, reason: true, fromLocation: true, toLocation: true, quantity: true },
  })) as {
    itemId: string;
    reason: "PLACE" | "TRANSFER" | "REMOVE";
    fromLocation: string | null;
    toLocation: string | null;
    quantity: number;
  } | null;
}

/** Append a scan-audit row (every scan, including failures). */
export async function insertScanEvent(
  client: DbClientPort,
  row: {
    userId: string | null;
    deviceId: string | null;
    sessionId: string | null;
    action: string;
    rawCode: string;
    parsedObjectType: string | null;
    parsedObjectId: string | null;
    result: "SUCCESS" | "REJECTED" | "ERROR";
    errorCode: string | null;
    tenantKey: string;
  },
): Promise<void> {
  await client.scanEvent.create({ data: row });
}

// ── Location registry ───────────────────────────────────────────────────────

export interface StockLocationRow {
  code: string;
  zone: string | null;
  isActive: boolean;
  isBlocked: boolean;
}

/** Find a location registry row by normalized code within a warehouse. */
export async function findLocation(
  client: DbClientPort,
  code: string,
  tenantKey: string,
  warehouseId: string,
): Promise<StockLocationRow | null> {
  return (await client.stockLocation.findUnique({
    where: { tenantKey_warehouseId_code: { tenantKey, warehouseId, code } },
    select: { code: true, zone: true, isActive: true, isBlocked: true },
  })) as StockLocationRow | null;
}

/** Create-if-absent an active, unblocked location in a warehouse; returns its row. */
export async function ensureLocation(
  client: DbClientPort,
  code: string,
  tenantKey: string,
  warehouseId: string,
): Promise<StockLocationRow> {
  return (await client.stockLocation.upsert({
    where: { tenantKey_warehouseId_code: { tenantKey, warehouseId, code } },
    create: { code, tenantKey, warehouseId, isActive: true, isBlocked: false },
    update: {},
    select: { code: true, zone: true, isActive: true, isBlocked: true },
  })) as StockLocationRow;
}

/** All locations for a tenant + warehouse, ordered by code. */
export async function listLocationRows(
  client: DbClientPort,
  tenantKey: string,
  warehouseId: string,
): Promise<StockLocationRow[]> {
  return (await client.stockLocation.findMany({
    where: { tenantKey, warehouseId },
    select: { code: true, zone: true, isActive: true, isBlocked: true },
    orderBy: { code: "asc" },
  })) as StockLocationRow[];
}

/** Rename a location's registry code within a warehouse (no-op if absent). */
export async function renameLocationCode(
  client: DbClientPort,
  fromCode: string,
  toCode: string,
  tenantKey: string,
  warehouseId: string,
): Promise<void> {
  await client.stockLocation.updateMany({
    where: { tenantKey, warehouseId, code: fromCode },
    data: { code: toCode },
  });
}

/** Move every bin at `fromLocation` to `toLocation` within a warehouse. */
export async function relocateBins(
  client: DbClientPort,
  fromLocation: string,
  toLocation: string,
  tenantKey: string,
  warehouseId: string,
): Promise<void> {
  await client.stockBin.updateMany({
    where: { tenantKey, warehouseId, location: fromLocation },
    data: { location: toLocation },
  });
}

/** Total placed on-hand per location code (Σ StockBin.quantity), for display. */
export async function onHandByLocation(
  client: DbClientPort,
  tenantKey: string,
  warehouseId: string,
): Promise<Map<string, number>> {
  const groupBy = client.stockBin.groupBy as unknown as (
    args: unknown,
  ) => Promise<Array<{ location: string; _sum: { quantity: number | null } }>>;
  const rows = await groupBy({
    by: ["location"],
    where: { tenantKey, warehouseId },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.location, r._sum.quantity ?? 0]));
}

/** Update a location's active/blocked flags (create-if-absent so the toggle is
 *  usable for an auto-created location that has no explicit row yet). */
export async function updateLocationFlags(
  client: DbClientPort,
  code: string,
  tenantKey: string,
  warehouseId: string,
  flags: { isActive?: boolean; isBlocked?: boolean },
): Promise<StockLocationRow> {
  return (await client.stockLocation.upsert({
    where: { tenantKey_warehouseId_code: { tenantKey, warehouseId, code } },
    create: {
      code,
      tenantKey,
      warehouseId,
      isActive: flags.isActive ?? true,
      isBlocked: flags.isBlocked ?? false,
    },
    update: flags,
    select: { code: true, zone: true, isActive: true, isBlocked: true },
  })) as StockLocationRow;
}

/** Resolve a stock view by external itemId (= partId). */
export async function findViewByItemId(
  client: DbClientPort,
  itemId: string,
  warehouseId: string,
): Promise<StockItemView | null> {
  const row = (await client.stockItem.findUnique({
    where: { partId_warehouseId: { partId: itemId, warehouseId } },
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
