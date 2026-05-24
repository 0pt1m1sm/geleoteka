import type { RecordMovementInput, MovementResult } from "./types";
import { WmsError } from "./errors";
import { deltasForReason } from "../internal/counters";
import {
  ensureStockItem,
  insertMovement,
  applyDeltas,
  isUniqueViolation,
  findMovementByKey,
  type DbClientPort,
} from "../internal/repository";

const DEFAULT_TENANT = "default";

/**
 * The single chokepoint for stock changes. Writes an audit StockMovement and
 * atomically adjusts the StockItem on-hand/reserved counters.
 *
 * The DB client is INJECTED (`client`) — pass a `$transaction` tx so the
 * movement + counter update are atomic with the caller's other writes. The
 * call is idempotent on (tenantKey, source.type, source.id, reason): a repeat
 * returns `{ applied: false }` without re-adjusting counters.
 *
 * Validation: qty must be > 0 for every reason except ADJUSTMENT (signed,
 * non-zero); source.id must be non-null for every reason except ADJUSTMENT
 * (Postgres treats NULL as distinct in the idempotency index, so a null source
 * would bypass dedupe and double-count).
 */
export async function recordMovement(
  client: DbClientPort,
  input: RecordMovementInput,
): Promise<MovementResult> {
  const tenantKey = input.tenantKey ?? DEFAULT_TENANT;

  if (input.reason === "ADJUSTMENT") {
    if (input.qty === 0) throw WmsError.invalidQty(input.reason);
  } else {
    if (input.qty <= 0) throw WmsError.invalidQty(input.reason);
    if (!input.source.id) throw WmsError.nullSource(input.reason);
  }

  const item = await ensureStockItem(client, input.item.itemId, tenantKey, input.item.warehouseId);

  const { quantityDelta } = deltasForReason(input.reason, input.qty);
  let { reservedDelta } = deltasForReason(input.reason, input.qty);
  // Never drive reserved below zero (e.g. consuming more than was held).
  if (reservedDelta < 0) reservedDelta = -Math.min(-reservedDelta, item.reserved);

  const idempotencyKey = input.idempotencyKey ?? null;

  const noop = (): MovementResult => ({
    applied: false,
    itemId: input.item.itemId,
    quantity: item.quantity,
    reserved: item.reserved,
    available: item.quantity - item.reserved,
  });

  // Pre-check the idempotency key BEFORE inserting. A failed insert aborts the
  // surrounding Postgres transaction, so the disambiguation SELECT must run
  // first (not in the catch). The unique constraint remains only as a
  // concurrency backstop (handled in the catch as a plain no-op).
  if (idempotencyKey) {
    const prior = await findMovementByKey(client, tenantKey, idempotencyKey);
    if (prior) {
      const samePayload =
        prior.itemId === item.id &&
        prior.reason === input.reason &&
        prior.quantityDelta === quantityDelta &&
        prior.reservedDelta === reservedDelta &&
        prior.sourceType === input.source.type &&
        prior.sourceId === input.source.id;
      if (!samePayload) throw WmsError.idempotencyKeyReused();
      return noop(); // identical payload already applied → idempotent no-op
    }
  }

  try {
    await insertMovement(client, {
      itemId: item.id,
      reason: input.reason,
      quantityDelta,
      reservedDelta,
      sourceType: input.source.type,
      sourceId: input.source.id,
      actorUserId: input.actorId ?? null,
      note: input.note ?? null,
      idempotencyKey,
      warehouseId: input.item.warehouseId,
      tenantKey,
    });
  } catch (e) {
    // Source-triple collision, or a rare concurrent key insert that beat us →
    // idempotent no-op. Do NOT query here (the tx may be aborted by the P2002).
    // Accepted bound (same as placement): a CONCURRENT same-key/different-payload
    // race reports applied:false instead of IDEMPOTENCY_KEY_REUSED — the
    // sequential reuse case is caught by the pre-check above; the concurrent
    // loser is a no-op (no wrong write applied). Unreachable from the UI, which
    // generates a fresh key per operation.
    if (isUniqueViolation(e)) return noop();
    throw e;
  }

  const updated = await applyDeltas(client, item.id, quantityDelta, reservedDelta);
  return {
    applied: true,
    itemId: input.item.itemId,
    quantity: updated.quantity,
    reserved: updated.reserved,
    available: updated.quantity - updated.reserved,
  };
}
