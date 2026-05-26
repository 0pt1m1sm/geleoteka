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
import { type DbClientPort } from "@/lib/wms/public";
import { defaultWarehouseId } from "@/lib/wms-host";
import {
  enrichOpenConsumeLines,
  applyScanConsume,
  consumedLineKeys,
  type OpenConsumeLine,
  type RequiredConsumeLine,
} from "./scan-consume";

/** A pack line is structurally the shared open-consume line. */
export type OpenPackLine = OpenConsumeLine;

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
async function requiredLines(client: DbClientPort, orderId: string): Promise<RequiredConsumeLine[] | null> {
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

/** Lines on this order that have NOT yet been consumed (packed), with the part
 *  identity, required qty, and current bins to pick from. */
export async function openPackLinesForOrder(
  client: DbClientPort,
  orderId: string,
  warehouseId?: string,
): Promise<OpenPackLine[]> {
  warehouseId ??= await defaultWarehouseId(client);
  return enrichOpenConsumeLines(
    client,
    "PartShipment",
    orderId,
    await requiredLines(client, orderId),
    warehouseId,
  );
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
  /** Physical warehouse to consume from. Omitted → the tenant default (MAIN). */
  warehouseId?: string;
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
  const warehouseId = input.warehouseId ?? (await defaultWarehouseId(client));
  const open = await enrichOpenConsumeLines(
    client,
    "PartShipment",
    input.orderId,
    await requiredLines(client, input.orderId),
    warehouseId,
  );
  return applyScanConsume(client, {
    open,
    sourceType: "PartShipment",
    orderId: input.orderId,
    lineKey: input.lineKey,
    partId: input.partId,
    location: input.location,
    warehouseId,
    actorId: input.actorId,
    wrongItemError: new PackError("WRONG_ITEM", "Запчасть не из этого заказа"),
  });
}

/** True iff the order is packable AND every required line is consumed. Drives the
 *  ship gate (and the dispatch-skip decision in updatePartOrderStatus). An order
 *  with no required lines counts as fully packed (nothing to fulfil). */
export async function isFullyPacked(client: DbClientPort, orderId: string): Promise<boolean> {
  const lines = await requiredLines(client, orderId);
  if (!lines) return false;
  const consumed = await consumedLineKeys(client, "PartShipment", orderId);
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
  const consumed = await consumedLineKeys(client, "PartShipment", orderId);
  const packed = lines.filter((l) => consumed.has(l.lineKey)).length;
  return { packed, required: lines.length };
}
