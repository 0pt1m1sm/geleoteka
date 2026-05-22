import type { RecordMovementInput, MovementResult } from "./types";
import { WmsError } from "./errors";
import { deltasForReason } from "../internal/counters";
import {
  ensureStockItem,
  insertMovement,
  applyDeltas,
  isUniqueViolation,
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

  const item = await ensureStockItem(client, input.item.itemId, tenantKey);

  const { quantityDelta } = deltasForReason(input.reason, input.qty);
  let { reservedDelta } = deltasForReason(input.reason, input.qty);
  // Never drive reserved below zero (e.g. consuming more than was held).
  if (reservedDelta < 0) reservedDelta = -Math.min(-reservedDelta, item.reserved);

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
      tenantKey,
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Already applied — idempotent no-op. Report current counters.
      return {
        applied: false,
        itemId: input.item.itemId,
        quantity: item.quantity,
        reserved: item.reserved,
        available: item.quantity - item.reserved,
      };
    }
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
