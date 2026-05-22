import type {
  ItemPlacement,
  ItemInLocation,
  PlaceStockInput,
  TransferStockInput,
  RemoveFromBinInput,
} from "./types";
import { WmsError } from "./errors";
import {
  ensureStockItem,
  sumBins,
  findBinsForItem,
  findItemsInLocation,
  incrementBin,
  decrementBinIfEnough,
  insertBinMovement,
  type DbClientPort,
} from "../internal/repository";

const DEFAULT_TENANT = "default";

/** Locations are matched case-insensitively; normalize to upper/trimmed. */
function normalizeLocation(location: string): string {
  return location.trim().toUpperCase();
}

function assertPositive(qty: number): void {
  if (!Number.isInteger(qty) || qty <= 0) throw WmsError.invalidQty("PLACE");
}

/**
 * Putaway: move `qty` of an item's UNPLACED on-hand into `location`. Rejects
 * when `qty` exceeds `unplaced = quantity − Σbins`. Never changes the aggregate.
 * Pass a `$transaction` client so the check, the bin write, and the audit are atomic.
 */
export async function placeStock(client: DbClientPort, input: PlaceStockInput): Promise<void> {
  assertPositive(input.qty);
  const tenantKey = input.tenantKey ?? DEFAULT_TENANT;
  const location = normalizeLocation(input.location);
  const item = await ensureStockItem(client, input.itemId, tenantKey);

  const placed = await sumBins(client, item.id, tenantKey);
  const unplaced = item.quantity - placed;
  if (input.qty > unplaced) throw WmsError.insufficientUnplaced();

  await incrementBin(client, item.id, location, input.qty, tenantKey);
  await insertBinMovement(client, {
    itemId: item.id,
    reason: "PLACE",
    fromLocation: null,
    toLocation: location,
    quantity: input.qty,
    actorUserId: input.actorId ?? null,
    note: input.note ?? null,
    tenantKey,
  });
}

/**
 * Move `qty` between two bins. Rejects same source/destination and a source
 * bin holding less than `qty` (via a conditional decrement — no silent clamp).
 */
export async function transferStock(client: DbClientPort, input: TransferStockInput): Promise<void> {
  assertPositive(input.qty);
  const tenantKey = input.tenantKey ?? DEFAULT_TENANT;
  const from = normalizeLocation(input.from);
  const to = normalizeLocation(input.to);
  if (from === to) throw WmsError.sameLocation();
  const item = await ensureStockItem(client, input.itemId, tenantKey);

  const ok = await decrementBinIfEnough(client, item.id, from, input.qty, tenantKey);
  if (!ok) throw WmsError.insufficientBin();
  await incrementBin(client, item.id, to, input.qty, tenantKey);
  await insertBinMovement(client, {
    itemId: item.id,
    reason: "TRANSFER",
    fromLocation: from,
    toLocation: to,
    quantity: input.qty,
    actorUserId: input.actorId ?? null,
    note: input.note ?? null,
    tenantKey,
  });
}

/**
 * Return `qty` from a bin back to unplaced. Rejects when the bin holds less
 * than `qty` (conditional decrement — no silent clamp, no audit divergence).
 */
export async function removeFromBin(client: DbClientPort, input: RemoveFromBinInput): Promise<void> {
  assertPositive(input.qty);
  const tenantKey = input.tenantKey ?? DEFAULT_TENANT;
  const location = normalizeLocation(input.location);
  const item = await ensureStockItem(client, input.itemId, tenantKey);

  const ok = await decrementBinIfEnough(client, item.id, location, input.qty, tenantKey);
  if (!ok) throw WmsError.insufficientBin();
  await insertBinMovement(client, {
    itemId: item.id,
    reason: "REMOVE",
    fromLocation: location,
    toLocation: null,
    quantity: input.qty,
    actorUserId: input.actorId ?? null,
    note: input.note ?? null,
    tenantKey,
  });
}

/** Read an item's placement breakdown (bins + placed/unplaced + reconcile flag). */
export async function binsForItem(
  client: DbClientPort,
  itemId: string,
  tenantKey?: string,
): Promise<ItemPlacement> {
  const tenant = tenantKey ?? DEFAULT_TENANT;
  const si = (await (client as DbClientPort).stockItem.findUnique({
    where: { partId: itemId },
    select: { id: true, quantity: true },
  })) as { id: string; quantity: number } | null;

  if (!si) {
    return { itemId, quantity: 0, placed: 0, unplaced: 0, reconcileNeeded: false, bins: [] };
  }
  const bins = await findBinsForItem(client, si.id, tenant);
  const placed = bins.reduce((s, b) => s + b.quantity, 0);
  return {
    itemId,
    quantity: si.quantity,
    placed,
    unplaced: Math.max(0, si.quantity - placed),
    reconcileNeeded: placed > si.quantity,
    bins,
  };
}

/** List the items (external partId) stored in a location, with quantities. */
export async function itemsInLocation(
  client: DbClientPort,
  location: string,
  tenantKey?: string,
): Promise<ItemInLocation[]> {
  return findItemsInLocation(client, normalizeLocation(location), tenantKey ?? DEFAULT_TENANT);
}
