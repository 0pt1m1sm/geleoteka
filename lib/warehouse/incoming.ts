/**
 * Incoming (expected) stock = quantity still owed on a part's PART lines across
 * supplier orders that are placed but not yet fully received. Derived on read —
 * no denormalized column. Remaining per line is `quantity - receivedQuantity`
 * (receivedQuantity is cumulative — see Phase 2 scan-receive).
 */

/**
 * Supplier-order statuses that count as "open" for incoming stock: the order is
 * committed (not DRAFT/CANCELLED) and not yet closed (RECEIVED/COMPLETED).
 * PARTIALLY_RECEIVED is open — its unreceived remainder is still expected.
 */
export const OPEN_SUPPLIER_ORDER_STATUSES = [
  "ORDERED",
  "IN_TRANSIT",
  "CUSTOMS",
  "PARTIALLY_RECEIVED",
] as const;

interface SumRow {
  partId: string | null;
  _sum: { quantity: number | null; receivedQuantity: number | null };
}

/** Narrow structural view of the Prisma client — only the groupBy we use. The
 *  generated (@ts-nocheck) client's strict GroupByArgs overload leaks its result
 *  type into the arg constraint, so the field is typed `unknown` and cast to a
 *  loose call signature inside the function (same pattern as WarehouseOverview). */
interface IncomingClient {
  supplierOrderItem: { groupBy: unknown };
}

type GroupByFn = (args: unknown) => Promise<SumRow[]>;

/**
 * Map of partId → units expected to arrive, for the given parts. Only PART
 * lines on open orders contribute; parts with nothing incoming are absent
 * from the map (callers default to 0). Single batch groupBy — no N+1.
 */
export async function incomingByPartIds(
  client: IncomingClient,
  partIds: string[],
): Promise<Map<string, number>> {
  if (partIds.length === 0) return new Map();

  const groupBy = client.supplierOrderItem.groupBy as GroupByFn;
  const rows = await groupBy({
    by: ["partId"],
    where: {
      partId: { in: partIds },
      type: "PART",
      order: { status: { in: OPEN_SUPPLIER_ORDER_STATUSES } },
    },
    _sum: { quantity: true, receivedQuantity: true },
  });

  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.partId) continue;
    const remaining = (r._sum.quantity ?? 0) - (r._sum.receivedQuantity ?? 0);
    if (remaining > 0) map.set(r.partId, remaining);
  }
  return map;
}
