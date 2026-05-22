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
