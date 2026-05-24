// Host-side scan-to-pick for repair orders. Reads the deal's APPROVED estimate
// PART lines, treats a line as "picked" iff a CONSUMPTION movement already
// exists for its RepairOrder source triple, and consumes a FULL line from a
// scanned bin (bin-aware via consumeStock). Knows about RepairOrder/Estimate
// (host knowledge), so it lives OUTSIDE lib/wms (the host-agnostic core).
import { binsForItem, consumeStock, type DbClientPort, type BinPlacement } from "@/lib/wms/public";
import { TENANT_KEY, defaultWarehouseId } from "@/lib/wms-host";

export interface OpenPickLine {
  lineId: string;
  partId: string;
  name: string;
  article: string;
  requiredQty: number;
  bins: BinPlacement[];
}

/** WRONG_ITEM is an order-line concept (host knowledge), so it is NOT a WmsError
 *  — mirrors scan-router's WRONG_OBJECT_TYPE plain outcome code. INSUFFICIENT_BIN
 *  stays a WmsError raised by consumeStock. */
export class PickError extends Error {
  constructor(
    public readonly code: "WRONG_ITEM",
    message: string,
  ) {
    super(message);
    this.name = "PickError";
  }
}

interface EstLine {
  id: string;
  partId: string | null;
  qty: number;
}

/** RO statuses for which picking is allowed. A CANCELLED order must NOT consume
 *  stock; a COMPLETED order already consumed its parts at close (so its lines are
 *  excluded as consumed anyway) — guarding here is the authoritative lifecycle
 *  gate so a direct mutation against a known RO id cannot bypass the list filter. */
const PICKABLE_STATUSES = new Set(["SCHEDULED", "IN_PROGRESS", "READY"]);

/** The RO's deal's latest APPROVED estimate PART lines (with a partId). Returns
 *  null when the RO is missing OR not in a pickable status (the security gate). */
async function approvedPartLines(
  client: DbClientPort,
  repairOrderId: string,
): Promise<EstLine[] | null> {
  const ro = (await client.repairOrder.findUnique({
    where: { id: repairOrderId },
    select: { dealId: true, status: true },
  })) as { dealId: string; status: string } | null;
  if (!ro || !PICKABLE_STATUSES.has(ro.status)) return null;
  const est = (await client.estimate.findFirst({
    where: { dealId: ro.dealId, stage: "APPROVED" },
    orderBy: { approvedAt: "desc" },
    select: {
      estimateLines: {
        where: { type: "PART", partId: { not: null } },
        select: { id: true, partId: true, qty: true },
      },
    },
  })) as { estimateLines: EstLine[] } | null;
  return est?.estimateLines ?? null;
}

/** Lines on this RO's APPROVED estimate that have NOT yet been consumed (picked
 *  or closed), with the part identity, required qty, and current bins to pick from. */
export async function openPickLinesForOrder(
  client: DbClientPort,
  repairOrderId: string,
): Promise<OpenPickLine[]> {
  const lines = await approvedPartLines(client, repairOrderId);
  if (!lines) return [];

  // A line is "done" iff a CONSUMPTION movement exists for `${roId}:${lineId}`.
  const consumed = (await client.stockMovement.findMany({
    where: {
      tenantKey: TENANT_KEY,
      sourceType: "RepairOrder",
      sourceId: { startsWith: `${repairOrderId}:` },
      reason: "CONSUMPTION",
    },
    select: { sourceId: true },
  })) as Array<{ sourceId: string | null }>;
  const prefixLen = `${repairOrderId}:`.length;
  const consumedLineIds = new Set(consumed.map((m) => (m.sourceId ?? "").slice(prefixLen)));

  const open = lines
    .map((l) => ({ lineId: l.id, partId: l.partId as string, requiredQty: Math.round(l.qty) }))
    .filter((l) => l.requiredQty > 0 && !consumedLineIds.has(l.lineId));
  if (open.length === 0) return [];

  const parts = (await client.part.findMany({
    where: { id: { in: open.map((l) => l.partId) } },
    select: { id: true, name: true, article: true },
  })) as Array<{ id: string; name: string; article: string }>;
  const byId = new Map(parts.map((p) => [p.id, p]));

  const warehouseId = await defaultWarehouseId(client);
  const result: OpenPickLine[] = [];
  for (const l of open) {
    const placement = await binsForItem(client, l.partId, warehouseId, TENANT_KEY);
    result.push({
      lineId: l.lineId,
      partId: l.partId,
      name: byId.get(l.partId)?.name ?? "—",
      article: byId.get(l.partId)?.article ?? "",
      requiredQty: l.requiredQty,
      bins: placement.bins,
    });
  }
  return result;
}

export interface ApplyPickLineInput {
  repairOrderId: string;
  lineId: string;
  /** The scanned part — must match the open line's part, else WRONG_ITEM. */
  partId: string;
  /** The scanned bin to pick from. */
  location: string;
  actorId?: string;
}

/**
 * Pick one open line: consume its FULL server-derived quantity from the scanned
 * bin via consumeStock. The quantity is NEVER taken from the client — it is
 * `Math.round(line.qty)` (same rule as the RO close), so the shared RepairOrder
 * source triple makes a later close an idempotent no-op without hiding an
 * under-consumption. Throws PickError("WRONG_ITEM") when the scanned part is not
 * the open line's part; consumeStock throws INSUFFICIENT_BIN if the bin is short.
 * Pass a `$transaction` client so the check + consume are atomic.
 */
export async function applyPickLine(
  client: DbClientPort,
  input: ApplyPickLineInput,
): Promise<{ requiredQty: number }> {
  const open = await openPickLinesForOrder(client, input.repairOrderId);
  const line = open.find((l) => l.lineId === input.lineId);
  if (!line || line.partId !== input.partId) {
    throw new PickError("WRONG_ITEM", "Запчасть не из этого заказа");
  }
  await consumeStock(client, {
    item: { itemId: input.partId, warehouseId: await defaultWarehouseId(client) },
    qty: line.requiredQty,
    source: { type: "RepairOrder", id: `${input.repairOrderId}:${input.lineId}` },
    fromLocation: input.location,
    actorId: input.actorId,
    tenantKey: TENANT_KEY,
  });
  return { requiredQty: line.requiredQty };
}
