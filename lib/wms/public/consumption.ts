import type { ConsumeStockInput, MovementResult } from "./types";
import { WmsError } from "./errors";
import { recordMovement } from "./record-movement";
import {
  ensureStockItem,
  sumBins,
  findBinsOldestFirst,
  decrementBinIfEnough,
  insertBinMovement,
  movementExistsForSource,
  type DbClientPort,
} from "../internal/repository";
import { txCapable, type TxCapable } from "../internal/tx";

const DEFAULT_TENANT = "default";

/** Locations are matched case-insensitively; normalize to upper/trimmed (same
 *  rule as placement.ts so the bin lookup matches a placed cell). */
function normalizeLocation(location: string): string {
  return location.trim().toUpperCase();
}

/**
 * Bin-aware outbound consumption — the Phase-4 op that keeps `Σbins ≤ quantity`.
 * Records a CONSUMPTION movement through the aggregate chokepoint (recordMovement),
 * then, ONLY when that movement was newly applied, deducts the bins:
 *  - `fromLocation` set → consume that exact bin (scan-to-pick); short bin throws
 *    INSUFFICIENT_BIN.
 *  - omitted → auto-drain unplaced-first then oldest bins (server fulfillment),
 *    which also heals any pre-existing `Σbins > quantity` drift.
 *
 * Self-wraps in a transaction when handed the base client so the movement and the
 * bin deduction(s) commit or roll back together (a short explicit bin must NOT
 * leave a movement behind). Pass a `$transaction` tx to compose with other writes.
 */
export async function consumeStock(
  client: DbClientPort,
  input: ConsumeStockInput,
): Promise<MovementResult> {
  if (txCapable(client)) {
    return (client as unknown as TxCapable).$transaction((tx) => consumeStockImpl(tx, input));
  }
  return consumeStockImpl(client, input);
}

async function consumeStockImpl(
  client: DbClientPort,
  input: ConsumeStockInput,
): Promise<MovementResult> {
  const tenantKey = input.tenantKey ?? DEFAULT_TENANT;

  // Source-triple pre-check: if this consumption already ran (e.g. an RO close
  // looping over a line that was scan-picked early), short-circuit to a no-op
  // BEFORE recordMovement's insert would raise P2002. A caught P2002 aborts the
  // surrounding PG transaction, which — when consumeStock is composed inside a
  // caller's multi-line tx — would poison the consumption of the OTHER lines.
  // (recordMovement runs the analogous pre-check only for its idempotencyKey; we
  // extend it to the source triple here, at the higher-level op, leaving the core
  // chokepoint untouched.) Skipped when an idempotencyKey is given — recordMovement
  // pre-checks that itself; and when source.id is null (only ADJUSTMENT, never us).
  if (!input.idempotencyKey && input.source.id) {
    const already = await movementExistsForSource(
      client,
      tenantKey,
      input.source.type,
      input.source.id,
      "CONSUMPTION",
    );
    if (already) {
      const si = await ensureStockItem(client, input.item.itemId, tenantKey);
      return {
        applied: false,
        itemId: input.item.itemId,
        quantity: si.quantity,
        reserved: si.reserved,
        available: si.quantity - si.reserved,
      };
    }
  }

  const mv = await recordMovement(client, {
    item: input.item,
    reason: "CONSUMPTION",
    qty: input.qty,
    source: input.source,
    actorId: input.actorId,
    note: input.note,
    idempotencyKey: input.idempotencyKey,
    tenantKey,
  });
  // Idempotent replay (same source triple / key) → the aggregate did not move,
  // so the bins must not move either.
  if (!mv.applied) return mv;

  const item = await ensureStockItem(client, input.item.itemId, tenantKey);
  const actorUserId = input.actorId ?? null;
  const note = input.note ?? null;

  if (input.fromLocation) {
    const location = normalizeLocation(input.fromLocation);
    const ok = await decrementBinIfEnough(client, item.id, location, input.qty, tenantKey);
    if (!ok) throw WmsError.insufficientBin();
    await insertBinMovement(client, {
      itemId: item.id,
      reason: "PICK",
      fromLocation: location,
      toLocation: null,
      quantity: input.qty,
      actorUserId,
      note,
      idempotencyKey: null,
      tenantKey,
    });
    return mv;
  }

  // Auto path: pull the amount by which bins now exceed on-hand (mv.quantity is
  // the post-movement on-hand — no re-read), oldest-first. `needed ≤ Σbins`
  // always holds, so the loop cannot under-fill. In the drift case
  // (Σbins > on-hand before) `needed > qty` — intentional, it heals the drift.
  const placed = await sumBins(client, item.id, tenantKey);
  let needed = Math.max(0, placed - mv.quantity);
  if (needed === 0) return mv;

  const bins = await findBinsOldestFirst(client, item.id, tenantKey);
  for (const bin of bins) {
    if (needed === 0) break;
    const take = Math.min(needed, bin.quantity);
    const ok = await decrementBinIfEnough(client, item.id, bin.location, take, tenantKey);
    // Concurrent shrink (READ COMMITTED) → skip; remaining bins absorb. Same
    // accepted bound as placement.ts.
    if (!ok) continue;
    await insertBinMovement(client, {
      itemId: item.id,
      reason: "PICK",
      fromLocation: bin.location,
      toLocation: null,
      quantity: take,
      actorUserId,
      note,
      idempotencyKey: null,
      tenantKey,
    });
    needed -= take;
  }
  // If a concurrent session drained every bin between findBinsOldestFirst and our
  // decrements, `needed` can exit > 0, leaving Σbins above quantity by that
  // remainder — a fresh small drift entry that the NEXT consumption heals (same
  // accepted READ-COMMITTED bound as placement.ts). Unreachable from the UI.
  return mv;
}
