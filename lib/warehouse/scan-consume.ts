// Shared scan-to-consume engine for the two order-fulfilment flows (pick for a
// RepairOrder, pack for a PartShipment). Both do the identical physical action —
// scan a part + a shelf, consume the full server-derived line quantity from that
// bin via consumeStock against an `${sourceType}:${orderId}:${lineKey}` source
// triple — and differ only in their line RESOLVER, source-type prefix, allowed
// statuses, and (pack-only) downstream ship/notify. Those differences stay in the
// thin pick.ts / pack.ts wrappers; this module owns the duplicated mechanic.
import { binsForItem, consumeStock, type DbClientPort, type BinPlacement } from "@/lib/wms/public";
import { TENANT_KEY } from "@/lib/wms-host";

/** A required order line reduced to what the consume mechanic needs: a stable key
 *  (RO estimate-line id or PartShipment line key), the part, and the full qty. */
export interface RequiredConsumeLine {
  lineKey: string;
  partId: string;
  requiredQty: number;
}

/** A required line that is still open (not yet consumed), enriched for the UI. */
export interface OpenConsumeLine extends RequiredConsumeLine {
  name: string;
  article: string;
  bins: BinPlacement[];
}

/** A required line already consumed — the recap shown so a finished sheet names
 *  WHAT was picked/packed instead of a bare «все позиции обработаны». */
export interface DoneConsumeLine {
  lineKey: string;
  name: string;
  article: string;
  requiredQty: number;
}

/** The keys already consumed for an order — a line is "done" iff a CONSUMPTION
 *  movement exists for `${sourceType}:${orderId}:${lineKey}`. */
export async function consumedLineKeys(
  client: DbClientPort,
  sourceType: string,
  orderId: string,
): Promise<Set<string>> {
  const consumed = (await client.stockMovement.findMany({
    where: {
      tenantKey: TENANT_KEY,
      sourceType,
      sourceId: { startsWith: `${orderId}:` },
      reason: "CONSUMPTION",
    },
    select: { sourceId: true },
  })) as Array<{ sourceId: string | null }>;
  const prefixLen = `${orderId}:`.length;
  return new Set(consumed.map((m) => (m.sourceId ?? "").slice(prefixLen)));
}

/** Filter `required` to the not-yet-consumed lines and enrich each with the part
 *  identity + current bins to pick from. `required` is null when the resolver's
 *  security gate failed (order missing / not in an allowed status) → no open lines. */
export async function enrichOpenConsumeLines(
  client: DbClientPort,
  sourceType: string,
  orderId: string,
  required: RequiredConsumeLine[] | null,
  warehouseId: string,
): Promise<OpenConsumeLine[]> {
  if (!required || required.length === 0) return [];
  const consumed = await consumedLineKeys(client, sourceType, orderId);
  const open = required.filter((l) => l.requiredQty > 0 && !consumed.has(l.lineKey));
  if (open.length === 0) return [];

  const parts = (await client.part.findMany({
    where: { id: { in: open.map((l) => l.partId) } },
    select: { id: true, name: true, article: true },
  })) as Array<{ id: string; name: string; article: string }>;
  const byId = new Map(parts.map((p) => [p.id, p]));

  const result: OpenConsumeLine[] = [];
  for (const l of open) {
    const placement = await binsForItem(client, l.partId, warehouseId, TENANT_KEY);
    result.push({
      lineKey: l.lineKey,
      partId: l.partId,
      name: byId.get(l.partId)?.name ?? "—",
      article: byId.get(l.partId)?.article ?? "",
      requiredQty: l.requiredQty,
      bins: placement.bins,
    });
  }
  return result;
}

/** The already-consumed subset of `required`, enriched with part identity —
 *  the box-contents / picked-parts recap. Mirrors enrichOpenConsumeLines with
 *  the filter inverted (and no bin lookup — the stock already left the bins). */
export async function consumedLinesRecap(
  client: DbClientPort,
  sourceType: string,
  orderId: string,
  required: RequiredConsumeLine[] | null,
): Promise<DoneConsumeLine[]> {
  if (!required || required.length === 0) return [];
  const consumed = await consumedLineKeys(client, sourceType, orderId);
  const done = required.filter((l) => consumed.has(l.lineKey));
  if (done.length === 0) return [];

  const parts = (await client.part.findMany({
    where: { id: { in: done.map((l) => l.partId) } },
    select: { id: true, name: true, article: true },
  })) as Array<{ id: string; name: string; article: string }>;
  const byId = new Map(parts.map((p) => [p.id, p]));

  return done.map((l) => ({
    lineKey: l.lineKey,
    name: byId.get(l.partId)?.name ?? "—",
    article: byId.get(l.partId)?.article ?? "",
    requiredQty: l.requiredQty,
  }));
}

export interface ApplyScanConsumeInput {
  /** The open lines (from enrichOpenConsumeLines) the scan is matched against. */
  open: OpenConsumeLine[];
  sourceType: string;
  orderId: string;
  lineKey: string;
  /** The scanned part — must match the selected line's part, else wrongItemError. */
  partId: string;
  /** The scanned bin to consume from. */
  location: string;
  warehouseId: string;
  actorId?: string;
  /** The domain error to throw on a part/line mismatch (PickError / PackError) so
   *  the thrown type stays meaningful to each flow's caller. */
  wrongItemError: Error;
  /** Partial-pick seam: the amount to consume. Defaults to the line's full
   *  required qty (current behaviour — full line per scan). A future partial-pick
   *  feature passes a smaller qty here; nothing else in the engine changes. */
  qty?: number;
}

/**
 * Find the selected open line, verify the scanned part matches it, and consume
 * the (full, by default) quantity from the scanned bin via consumeStock. The
 * quantity is NEVER taken from raw client input — it is the line's server-derived
 * requiredQty unless an explicit `qty` override is passed. The shared source
 * triple makes a later order close / dispatch an idempotent no-op. Pass a
 * `$transaction` client so the match + consume are atomic.
 */
export async function applyScanConsume(
  client: DbClientPort,
  input: ApplyScanConsumeInput,
): Promise<{ requiredQty: number }> {
  const line = input.open.find((l) => l.lineKey === input.lineKey);
  if (!line || line.partId !== input.partId) {
    throw input.wrongItemError;
  }
  await consumeStock(client, {
    item: { itemId: input.partId, warehouseId: input.warehouseId },
    qty: input.qty ?? line.requiredQty,
    source: { type: input.sourceType, id: `${input.orderId}:${input.lineKey}` },
    fromLocation: input.location,
    actorId: input.actorId,
    tenantKey: TENANT_KEY,
  });
  return { requiredQty: line.requiredQty };
}
