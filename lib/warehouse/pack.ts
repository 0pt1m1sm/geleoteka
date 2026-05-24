// Host-side scan-to-pack/ship for customer part-orders (PartShipment). Unifies
// the two PartShipment shapes behind one line model: a retail cart order carries
// PartOrderItem rows (consumed at sale, keyed by partId), while a CRM
// estimate-dispatched order has no items and draws its lines from the deal's
// APPROVED estimate (consumed at pack/dispatch, keyed by estimate-line id). A
// line is "packed/fulfilled" iff a CONSUMPTION movement exists for its
// `PartShipment:${orderId}:${lineKey}` source triple — the SAME triple both
// existing consume paths use, so packing a line makes the manual dispatch path
// idempotent. Knows about PartShipment/Estimate (host knowledge), so it lives
// OUTSIDE lib/wms (the host-agnostic core).
import { binsForItem, consumeStock, type DbClientPort, type BinPlacement } from "@/lib/wms/public";
import { TENANT_KEY, defaultWarehouseId } from "@/lib/wms-host";

export interface OpenPackLine {
  lineKey: string;
  partId: string;
  name: string;
  article: string;
  requiredQty: number;
  bins: BinPlacement[];
}

/** WRONG_ITEM is an order-line concept (host knowledge), so it is NOT a WmsError
 *  — mirrors pick.ts's PickError and scan-router's WRONG_OBJECT_TYPE plain code.
 *  INSUFFICIENT_BIN stays a WmsError raised by consumeStock. */
export class PackError extends Error {
  constructor(
    public readonly code: "WRONG_ITEM",
    message: string,
  ) {
    super(message);
    this.name = "PackError";
  }
}

interface RequiredLine {
  lineKey: string;
  partId: string;
  requiredQty: number;
}

/** Statuses for which packing/shipping is allowed. The check lives here (not only
 *  in applyPackLine) so openPackLinesForOrder / isFullyPacked / packProgress all
 *  inherit the gate — a direct mutation against a CANCELLED/SHIPPED order id can
 *  never consume. Mirrors pick.ts PICKABLE_STATUSES. */
const PACKABLE_STATUSES = new Set(["PROCESSING"]);

/** The order's required lines, or null when the order is missing OR not in a
 *  packable status (the security gate). Retail orders (with PartOrderItem rows)
 *  key by partId to match the sale source `orderId:partId`; CRM orders draw from
 *  the deal's latest APPROVED estimate PART lines, keyed by estimate-line id to
 *  match the dispatch source `orderId:estimateLineId`. */
async function requiredLines(client: DbClientPort, orderId: string): Promise<RequiredLine[] | null> {
  const order = (await client.partShipment.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      dealId: true,
      items: { select: { partId: true, quantity: true } },
    },
  })) as {
    status: string;
    dealId: string;
    items: Array<{ partId: string; quantity: number }>;
  } | null;
  if (!order || !PACKABLE_STATUSES.has(order.status)) return null;

  if (order.items.length > 0) {
    return order.items
      .map((i) => ({ lineKey: i.partId, partId: i.partId, requiredQty: Math.round(i.quantity) }))
      .filter((l) => l.requiredQty > 0);
  }

  const est = (await client.estimate.findFirst({
    where: { dealId: order.dealId, stage: "APPROVED" },
    orderBy: { approvedAt: "desc" },
    select: {
      estimateLines: {
        where: { type: "PART", partId: { not: null } },
        select: { id: true, partId: true, qty: true },
      },
    },
  })) as { estimateLines: Array<{ id: string; partId: string | null; qty: number }> } | null;
  if (!est) return [];
  return est.estimateLines
    .filter((l) => l.partId)
    .map((l) => ({ lineKey: l.id, partId: l.partId as string, requiredQty: Math.round(l.qty) }))
    .filter((l) => l.requiredQty > 0);
}

/** The set of lineKeys already consumed for this order — a line is "packed" iff a
 *  CONSUMPTION movement exists for `PartShipment:${orderId}:${lineKey}`. */
async function consumedLineKeys(client: DbClientPort, orderId: string): Promise<Set<string>> {
  const consumed = (await client.stockMovement.findMany({
    where: {
      tenantKey: TENANT_KEY,
      sourceType: "PartShipment",
      sourceId: { startsWith: `${orderId}:` },
      reason: "CONSUMPTION",
    },
    select: { sourceId: true },
  })) as Array<{ sourceId: string | null }>;
  const prefixLen = `${orderId}:`.length;
  return new Set(consumed.map((m) => (m.sourceId ?? "").slice(prefixLen)));
}

/** Lines on this order that have NOT yet been consumed (packed), with the part
 *  identity, required qty, and current bins to pick from. */
export async function openPackLinesForOrder(
  client: DbClientPort,
  orderId: string,
): Promise<OpenPackLine[]> {
  const lines = await requiredLines(client, orderId);
  if (!lines || lines.length === 0) return [];
  const consumed = await consumedLineKeys(client, orderId);

  const open = lines.filter((l) => !consumed.has(l.lineKey));
  if (open.length === 0) return [];

  const parts = (await client.part.findMany({
    where: { id: { in: open.map((l) => l.partId) } },
    select: { id: true, name: true, article: true },
  })) as Array<{ id: string; name: string; article: string }>;
  const byId = new Map(parts.map((p) => [p.id, p]));

  const warehouseId = await defaultWarehouseId(client);
  const result: OpenPackLine[] = [];
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

export interface ApplyPackLineInput {
  orderId: string;
  /** The selected line (supplied by the UI, NOT derived from the scanned part).
   *  partId for retail, estimate-line id for CRM. */
  lineKey: string;
  /** The scanned part — must match the selected line's part, else WRONG_ITEM. */
  partId: string;
  /** The scanned bin to pick from. */
  location: string;
  actorId?: string;
}

/**
 * Pack one open line: consume its FULL server-derived quantity from the scanned
 * bin via consumeStock against `PartShipment:${orderId}:${lineKey}` — the SAME
 * source triple the dispatch path uses, so a later manual dispatch is an
 * idempotent no-op. The line is selected BY lineKey (so a CRM estimate with two
 * PART lines for the same part is disambiguated); the scanned part must match
 * that line, else PackError("WRONG_ITEM"). Quantity is NEVER taken from the
 * client. Pass a `$transaction` client so the check + consume are atomic.
 */
export async function applyPackLine(
  client: DbClientPort,
  input: ApplyPackLineInput,
): Promise<{ requiredQty: number }> {
  const open = await openPackLinesForOrder(client, input.orderId);
  const line = open.find((l) => l.lineKey === input.lineKey);
  if (!line || line.partId !== input.partId) {
    throw new PackError("WRONG_ITEM", "Запчасть не из этого заказа");
  }
  await consumeStock(client, {
    item: { itemId: input.partId, warehouseId: await defaultWarehouseId(client) },
    qty: line.requiredQty,
    source: { type: "PartShipment", id: `${input.orderId}:${input.lineKey}` },
    fromLocation: input.location,
    actorId: input.actorId,
    tenantKey: TENANT_KEY,
  });
  return { requiredQty: line.requiredQty };
}

/** True iff the order is packable AND every required line is consumed. Drives the
 *  ship gate (and the dispatch-skip decision in updatePartOrderStatus). An order
 *  with no required lines counts as fully packed (nothing to fulfil). */
export async function isFullyPacked(client: DbClientPort, orderId: string): Promise<boolean> {
  const lines = await requiredLines(client, orderId);
  if (!lines) return false;
  const consumed = await consumedLineKeys(client, orderId);
  return lines.every((l) => consumed.has(l.lineKey));
}

/** Packed-vs-required line counts for progress display. Returns {0,0} for a
 *  missing or non-PROCESSING order. */
export async function packProgress(
  client: DbClientPort,
  orderId: string,
): Promise<{ packed: number; required: number }> {
  const lines = await requiredLines(client, orderId);
  if (!lines) return { packed: 0, required: 0 };
  const consumed = await consumedLineKeys(client, orderId);
  const packed = lines.filter((l) => consumed.has(l.lineKey)).length;
  return { packed, required: lines.length };
}
