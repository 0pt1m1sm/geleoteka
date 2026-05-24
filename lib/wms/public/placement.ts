import type {
  ItemPlacement,
  ItemInLocation,
  PlaceStockInput,
  TransferStockInput,
  RemoveFromBinInput,
} from "./types";
import { WmsError } from "./errors";
import { assertLocationUsable } from "./locations";
import {
  ensureStockItem,
  sumBins,
  findBinsForItem,
  findItemsInLocation,
  incrementBin,
  decrementBinIfEnough,
  insertBinMovement,
  findBinMovementByKey,
  isUniqueViolation,
  type DbClientPort,
} from "../internal/repository";
import { txCapable, type TxCapable } from "../internal/tx";

const DEFAULT_TENANT = "default";

/** Locations are matched case-insensitively; normalize to upper/trimmed. */
function normalizeLocation(location: string): string {
  return location.trim().toUpperCase();
}

function assertPositive(qty: number): void {
  if (!Number.isInteger(qty) || qty <= 0) throw WmsError.invalidQty("PLACE");
}

interface BinAuditRow {
  itemId: string;
  reason: "PLACE" | "TRANSFER" | "REMOVE";
  fromLocation: string | null;
  toLocation: string | null;
  quantity: number;
  actorUserId: string | null;
  note: string | null;
  idempotencyKey: string | null;
  tenantKey: string;
}

/**
 * Insert the bin-movement audit (the idempotency claim when keyed). A P2002 on
 * a keyed insert means the key was already used: identical payload → an
 * already-applied DUPLICATE_OPERATION; different payload → IDEMPOTENCY_KEY_REUSED
 * (reject, never mask a different op as a silent success).
 */
async function auditBinMovement(client: DbClientPort, row: BinAuditRow): Promise<void> {
  if (!row.idempotencyKey) {
    await insertBinMovement(client, row);
    return;
  }
  // Pre-check the key BEFORE inserting — a P2002 aborts the surrounding tx, so
  // the disambiguation SELECT cannot run in the catch.
  const prior = await findBinMovementByKey(client, row.tenantKey, row.idempotencyKey);
  if (prior) {
    const samePayload =
      prior.itemId === row.itemId &&
      prior.reason === row.reason &&
      prior.fromLocation === row.fromLocation &&
      prior.toLocation === row.toLocation &&
      prior.quantity === row.quantity;
    throw samePayload ? WmsError.duplicateOperation() : WmsError.idempotencyKeyReused();
  }
  try {
    await insertBinMovement(client, row);
  } catch (e) {
    // The pre-check above handles the realistic case (sequential retry with the
    // same key). A P2002 here means a CONCURRENT insert with the same key won
    // the race between our pre-check and our insert. We report DUPLICATE_OPERATION
    // rather than disambiguating payload, because the P2002 has aborted this
    // transaction so a follow-up SELECT cannot run on it. Accepted bound: a
    // concurrent same-key/DIFFERENT-payload race reports DUPLICATE_OPERATION
    // instead of IDEMPOTENCY_KEY_REUSED. This is unreachable from the UI (a fresh
    // key is generated per operation) and never applies a wrong write — the loser
    // is a rolled-back no-op, not a silent success.
    if (isUniqueViolation(e)) throw WmsError.duplicateOperation();
    throw e;
  }
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
  const key = input.idempotencyKey ?? null;
  // Self-wrap: when keyed and handed the base client, run the claim + bin
  // mutation in one transaction so a later throw rolls the claim back (the key
  // is never burned without the stock delta). When already inside a caller's
  // tx (no $transaction on the client), compose with it.
  if (key && txCapable(client)) {
    return (client as unknown as TxCapable).$transaction((tx) =>
      placeStockImpl(tx, input, tenantKey, location, key),
    );
  }
  return placeStockImpl(client, input, tenantKey, location, key);
}

async function placeStockImpl(
  client: DbClientPort,
  input: PlaceStockInput,
  tenantKey: string,
  location: string,
  key: string | null,
): Promise<void> {
  await assertLocationUsable(client, location, input.warehouseId, tenantKey);
  const item = await ensureStockItem(client, input.itemId, tenantKey, input.warehouseId);

  const placed = await sumBins(client, item.id, tenantKey);
  const unplaced = item.quantity - placed;
  if (input.qty > unplaced) throw WmsError.insufficientUnplaced();

  const row: BinAuditRow = {
    itemId: item.id,
    reason: "PLACE",
    fromLocation: null,
    toLocation: location,
    quantity: input.qty,
    actorUserId: input.actorId ?? null,
    note: input.note ?? null,
    idempotencyKey: key,
    tenantKey,
  };
  if (key) {
    // Audit-first: claim the key before mutating the bin (atomic via self-wrap).
    await auditBinMovement(client, row);
    await incrementBin(client, item.id, location, input.qty, tenantKey, input.warehouseId);
  } else {
    await incrementBin(client, item.id, location, input.qty, tenantKey, input.warehouseId);
    await insertBinMovement(client, row);
  }
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
  const key = input.idempotencyKey ?? null;
  if (key && txCapable(client)) {
    return (client as unknown as TxCapable).$transaction((tx) =>
      transferStockImpl(tx, input, tenantKey, from, to, key),
    );
  }
  return transferStockImpl(client, input, tenantKey, from, to, key);
}

async function transferStockImpl(
  client: DbClientPort,
  input: TransferStockInput,
  tenantKey: string,
  from: string,
  to: string,
  key: string | null,
): Promise<void> {
  // Destination only — a blocked SOURCE must still be evacuable.
  await assertLocationUsable(client, to, input.warehouseId, tenantKey);
  const item = await ensureStockItem(client, input.itemId, tenantKey, input.warehouseId);

  const row: BinAuditRow = {
    itemId: item.id,
    reason: "TRANSFER",
    fromLocation: from,
    toLocation: to,
    quantity: input.qty,
    actorUserId: input.actorId ?? null,
    note: input.note ?? null,
    idempotencyKey: key,
    tenantKey,
  };
  if (key) {
    await auditBinMovement(client, row); // claim first
    const ok = await decrementBinIfEnough(client, item.id, from, input.qty, tenantKey);
    if (!ok) throw WmsError.insufficientBin();
    await incrementBin(client, item.id, to, input.qty, tenantKey, input.warehouseId);
  } else {
    const ok = await decrementBinIfEnough(client, item.id, from, input.qty, tenantKey);
    if (!ok) throw WmsError.insufficientBin();
    await incrementBin(client, item.id, to, input.qty, tenantKey, input.warehouseId);
    await insertBinMovement(client, row);
  }
}

/**
 * Return `qty` from a bin back to unplaced. Rejects when the bin holds less
 * than `qty` (conditional decrement — no silent clamp, no audit divergence).
 */
export async function removeFromBin(client: DbClientPort, input: RemoveFromBinInput): Promise<void> {
  assertPositive(input.qty);
  const tenantKey = input.tenantKey ?? DEFAULT_TENANT;
  const location = normalizeLocation(input.location);
  const key = input.idempotencyKey ?? null;
  if (key && txCapable(client)) {
    return (client as unknown as TxCapable).$transaction((tx) =>
      removeFromBinImpl(tx, input, tenantKey, location, key),
    );
  }
  return removeFromBinImpl(client, input, tenantKey, location, key);
}

async function removeFromBinImpl(
  client: DbClientPort,
  input: RemoveFromBinInput,
  tenantKey: string,
  location: string,
  key: string | null,
): Promise<void> {
  const item = await ensureStockItem(client, input.itemId, tenantKey, input.warehouseId);

  const row: BinAuditRow = {
    itemId: item.id,
    reason: "REMOVE",
    fromLocation: location,
    toLocation: null,
    quantity: input.qty,
    actorUserId: input.actorId ?? null,
    note: input.note ?? null,
    idempotencyKey: key,
    tenantKey,
  };
  if (key) {
    await auditBinMovement(client, row); // claim first
    const ok = await decrementBinIfEnough(client, item.id, location, input.qty, tenantKey);
    if (!ok) throw WmsError.insufficientBin();
  } else {
    const ok = await decrementBinIfEnough(client, item.id, location, input.qty, tenantKey);
    if (!ok) throw WmsError.insufficientBin();
    await insertBinMovement(client, row);
  }
}

/** Read an item's placement breakdown (bins + placed/unplaced + reconcile flag). */
export async function binsForItem(
  client: DbClientPort,
  itemId: string,
  warehouseId: string,
  tenantKey?: string,
): Promise<ItemPlacement> {
  const tenant = tenantKey ?? DEFAULT_TENANT;
  const si = (await (client as DbClientPort).stockItem.findUnique({
    where: { partId_warehouseId: { partId: itemId, warehouseId } },
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
  warehouseId: string,
  tenantKey?: string,
): Promise<ItemInLocation[]> {
  return findItemsInLocation(client, normalizeLocation(location), tenantKey ?? DEFAULT_TENANT, warehouseId);
}
