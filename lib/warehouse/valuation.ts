/**
 * Stock valuation (WMS Phase 6) — host-side, pure over StockItem + SupplierOrderItem.
 *
 * Cost basis = the latest purchase unit cost per part (most recent supplier order
 * by orderDate; PART lines only). Parts never purchased have no cost basis and are
 * surfaced as a count rather than valued at 0.
 *
 * ⛔ Single-warehouse-safe only: sums StockItem without a warehouseId filter. Task 8
 *    adds the filter — do not create a second warehouse before then.
 */

/** Structural port: only the delegates this module touches. */
interface ValuationDb {
  part: { findMany: unknown };
  supplierOrderItem: { findMany: unknown };
}
type FindManyFn = (args: unknown) => Promise<unknown>;

interface CostRow {
  partId: string | null;
  unitCost: number;
  order: { orderDate: Date } | null;
}

/**
 * Map of partId → latest purchase unit cost (₽), for the given parts. Only PART
 * supplier-order lines contribute; the row with the most recent `order.orderDate`
 * wins (tie-break: later-iterated row). Parts never purchased are absent.
 */
export async function latestUnitCostByPartIds(
  db: ValuationDb,
  partIds: string[],
): Promise<Map<string, number>> {
  if (partIds.length === 0) return new Map();
  const findMany = db.supplierOrderItem.findMany as FindManyFn;
  const rows = (await findMany({
    where: { type: "PART", partId: { in: partIds } },
    select: { partId: true, unitCost: true, order: { select: { orderDate: true } } },
    // Deterministic tie-break: among same-date rows the last iterated (largest id) wins.
    orderBy: [{ order: { orderDate: "asc" } }, { id: "asc" }],
  })) as CostRow[];

  const latest = new Map<string, { cost: number; at: number }>();
  for (const r of rows) {
    if (!r.partId) continue;
    const at = r.order ? new Date(r.order.orderDate).getTime() : 0;
    const prev = latest.get(r.partId);
    if (!prev || at >= prev.at) latest.set(r.partId, { cost: r.unitCost, at });
  }
  return new Map([...latest].map(([pid, v]) => [pid, v.cost]));
}

export interface ValuationRow {
  partId: string;
  name: string;
  article: string;
  onHand: number;
  /** Latest purchase unit cost (₽), or null when the part was never purchased. */
  unitCost: number | null;
  /** onHand × unitCost (₽), or null when there is no cost basis. */
  lineValue: number | null;
}

export interface ValuationReport {
  rows: ValuationRow[];
  /** Sum of known-cost line values (₽). Null-cost lines excluded. */
  totalValue: number;
  /** In-stock parts (onHand > 0) with no cost basis. */
  noCostCount: number;
}

interface PartWithStock {
  id: string;
  name: string;
  article: string;
  stockItems: Array<{ quantity: number }>;
}

/**
 * Build the valuation dataset: every active part that has a StockItem, valued at
 * on-hand × latest purchase unit cost. Two batched queries (parts + cost map);
 * no N+1. Sorted by name.
 */
export async function buildValuationReport(
  db: ValuationDb,
  tenantKey: string,
  warehouseId: string,
): Promise<ValuationReport> {
  const findMany = db.part.findMany as FindManyFn;
  const parts = (await findMany({
    where: { isActive: true, stockItems: { some: { tenantKey, warehouseId } } },
    select: {
      id: true,
      name: true,
      article: true,
      stockItems: { where: { warehouseId }, select: { quantity: true } },
    },
    orderBy: { name: "asc" },
  })) as PartWithStock[];

  const costMap = await latestUnitCostByPartIds(
    db,
    parts.map((p) => p.id),
  );

  let totalValue = 0;
  let noCostCount = 0;
  const rows: ValuationRow[] = [];
  for (const p of parts) {
    const onHand = p.stockItems[0]?.quantity ?? 0;
    const unitCost = costMap.has(p.id) ? costMap.get(p.id)! : null;
    const lineValue = unitCost !== null ? onHand * unitCost : null;
    if (lineValue !== null) totalValue += lineValue;
    if (unitCost === null && onHand > 0) noCostCount += 1;
    rows.push({ partId: p.id, name: p.name, article: p.article, onHand, unitCost, lineValue });
  }
  return { rows, totalValue, noCostCount };
}
