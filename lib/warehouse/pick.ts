// Host-side scan-to-pick for repair orders. Reads the deal's APPROVED estimate
// PART lines, treats a line as "picked" iff a CONSUMPTION movement already
// exists for its RepairOrder source triple, and consumes a FULL line from a
// scanned bin (bin-aware via consumeStock). Knows about RepairOrder/Estimate
// (host knowledge), so it lives OUTSIDE lib/wms (the host-agnostic core).
import { type DbClientPort, type BinPlacement } from "@/lib/wms/public";
import { defaultWarehouseId } from "@/lib/wms-host";
import {
  enrichOpenConsumeLines,
  applyScanConsume,
  consumedLinesRecap,
  type DoneConsumeLine,
  type RequiredConsumeLine,
} from "./scan-consume";

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
  opts?: { statusGate?: boolean },
): Promise<EstLine[] | null> {
  const ro = (await client.repairOrder.findUnique({
    where: { id: repairOrderId },
    select: { dealId: true, status: true },
  })) as { dealId: string; status: string } | null;
  // The status gate protects MUTATION paths; read-only recaps may relax it
  // (statusGate:false) so a COMPLETED order still names its picked parts.
  if (!ro || ((opts?.statusGate ?? true) && !PICKABLE_STATUSES.has(ro.status))) return null;
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

/** Map the RO's APPROVED estimate PART lines to the shared required-line shape
 *  (lineKey = estimate-line id). Null when the RO is missing / not pickable. */
async function requiredPickLines(
  client: DbClientPort,
  repairOrderId: string,
  opts?: { statusGate?: boolean },
): Promise<RequiredConsumeLine[] | null> {
  const lines = await approvedPartLines(client, repairOrderId, opts);
  if (!lines) return null;
  return lines
    .filter((l) => l.partId)
    .map((l) => ({ lineKey: l.id, partId: l.partId as string, requiredQty: Math.round(l.qty) }));
}

/** Already-picked lines — what has left the shelf for this RO. Read-only recap
 *  (no status gate), so a finished sheet names WHAT was picked. */
export async function pickedLinesForOrder(
  client: DbClientPort,
  repairOrderId: string,
): Promise<DoneConsumeLine[]> {
  return consumedLinesRecap(
    client,
    "RepairOrder",
    repairOrderId,
    await requiredPickLines(client, repairOrderId, { statusGate: false }),
  );
}

/** Lines on this RO's APPROVED estimate that have NOT yet been consumed (picked
 *  or closed), with the part identity, required qty, and current bins to pick from. */
export async function openPickLinesForOrder(
  client: DbClientPort,
  repairOrderId: string,
  warehouseId?: string,
): Promise<OpenPickLine[]> {
  warehouseId ??= await defaultWarehouseId(client);
  const open = await enrichOpenConsumeLines(
    client,
    "RepairOrder",
    repairOrderId,
    await requiredPickLines(client, repairOrderId),
    warehouseId,
  );
  // RO callers address lines by `lineId` (the historical field name).
  return open.map((l) => ({
    lineId: l.lineKey,
    partId: l.partId,
    name: l.name,
    article: l.article,
    requiredQty: l.requiredQty,
    bins: l.bins,
  }));
}

export interface ApplyPickLineInput {
  repairOrderId: string;
  lineId: string;
  /** The scanned part — must match the open line's part, else WRONG_ITEM. */
  partId: string;
  /** The scanned bin to pick from. */
  location: string;
  actorId?: string;
  /** Physical warehouse to consume from. Omitted → the tenant default (MAIN). */
  warehouseId?: string;
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
  const warehouseId = input.warehouseId ?? (await defaultWarehouseId(client));
  const open = await enrichOpenConsumeLines(
    client,
    "RepairOrder",
    input.repairOrderId,
    await requiredPickLines(client, input.repairOrderId),
    warehouseId,
  );
  return applyScanConsume(client, {
    open,
    sourceType: "RepairOrder",
    orderId: input.repairOrderId,
    lineKey: input.lineId,
    partId: input.partId,
    location: input.location,
    warehouseId,
    actorId: input.actorId,
    wrongItemError: new PickError("WRONG_ITEM", "Запчасть не из этого заказа"),
  });
}
