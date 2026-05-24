/**
 * Dead-stock + ABC analysis (WMS Phase 6) — host-side, over the StockMovement
 * ledger. Dead-stock = in-stock parts with no CONSUMPTION in the window. ABC =
 * parts classified by cumulative consumed-QUANTITY share (A ≤80%, B ≤95%, else C)
 * over the window. Batched groupBy queries — no N+1.
 *
 * ⛔ Single-warehouse-safe only: no warehouseId filter. Task 8 adds it — do not
 *    create a second warehouse before then.
 */
const DAY_MS = 86400000;

interface AnalysisDb {
  stockMovement: { groupBy: unknown };
  part: { findMany: unknown };
  stockItem: { findMany: unknown };
}
type GroupByFn = (args: unknown) => Promise<Array<Record<string, unknown>>>;
type FindManyFn = (args: unknown) => Promise<unknown>;

export interface DeadStockRow {
  partId: string;
  name: string;
  article: string;
  onHand: number;
  /** Most recent CONSUMPTION ever, or null if never consumed. */
  lastConsumedAt: Date | null;
}

export interface AbcRow {
  partId: string;
  name: string;
  article: string;
  consumedQty: number;
  /** Cumulative share of total consumed qty (0–100), ascending by rank. */
  cumulativeShare: number;
  abcClass: "A" | "B" | "C";
}

interface PartWithItem {
  id: string;
  name: string;
  article: string;
  stockItems: Array<{ id: string; quantity: number }>;
}

/** In-stock parts with no CONSUMPTION movement within the last `windowDays`. */
export async function deadStock(
  db: AnalysisDb,
  tenantKey: string,
  warehouseId: string,
  windowDays: number,
): Promise<DeadStockRow[]> {
  const cutoff = new Date(Date.now() - windowDays * DAY_MS);
  const groupBy = db.stockMovement.groupBy as GroupByFn;

  const recentRows = await groupBy({
    by: ["itemId"],
    where: { tenantKey, warehouseId, reason: "CONSUMPTION", createdAt: { gte: cutoff } },
  });
  const recentItemIds = new Set(recentRows.map((r) => r.itemId as string));

  const lastRows = await groupBy({
    by: ["itemId"],
    where: { tenantKey, warehouseId, reason: "CONSUMPTION" },
    _max: { createdAt: true },
  });
  const lastConsumed = new Map<string, Date>(
    lastRows.map((r) => [r.itemId as string, (r._max as { createdAt: Date | null }).createdAt as Date]),
  );

  const findMany = db.part.findMany as FindManyFn;
  const parts = (await findMany({
    where: { isActive: true, stockItems: { some: { tenantKey, warehouseId, quantity: { gt: 0 } } } },
    select: {
      id: true,
      name: true,
      article: true,
      stockItems: { where: { warehouseId }, select: { id: true, quantity: true } },
    },
    orderBy: { name: "asc" },
  })) as PartWithItem[];

  const rows: DeadStockRow[] = [];
  for (const p of parts) {
    const si = p.stockItems[0];
    if (!si || recentItemIds.has(si.id)) continue;
    rows.push({
      partId: p.id,
      name: p.name,
      article: p.article,
      onHand: si.quantity,
      lastConsumedAt: lastConsumed.get(si.id) ?? null,
    });
  }
  return rows;
}

interface StockItemWithPart {
  id: string;
  part: { id: string; name: string; article: string } | null;
}

/** ABC classification by consumed quantity over the window (A ≤80%, B ≤95%, else C). */
export async function abcAnalysis(
  db: AnalysisDb,
  tenantKey: string,
  warehouseId: string,
  windowDays: number,
): Promise<AbcRow[]> {
  const cutoff = new Date(Date.now() - windowDays * DAY_MS);
  const groupBy = db.stockMovement.groupBy as GroupByFn;

  const sumRows = await groupBy({
    by: ["itemId"],
    where: { tenantKey, warehouseId, reason: "CONSUMPTION", createdAt: { gte: cutoff } },
    _sum: { quantityDelta: true },
  });
  // CONSUMPTION deltas are negative on-hand → consumed qty = -sum.
  const consumed = new Map<string, number>();
  for (const r of sumRows) {
    const delta = (r._sum as { quantityDelta: number | null }).quantityDelta ?? 0;
    const qty = -delta;
    if (qty > 0) consumed.set(r.itemId as string, qty);
  }
  if (consumed.size === 0) return [];

  const findMany = db.stockItem.findMany as FindManyFn;
  const items = (await findMany({
    where: { id: { in: [...consumed.keys()] } },
    select: { id: true, part: { select: { id: true, name: true, article: true } } },
  })) as StockItemWithPart[];
  const partByItem = new Map(items.map((i) => [i.id, i.part]));

  const ranked = [...consumed.entries()]
    .map(([itemId, qty]) => ({ itemId, qty, part: partByItem.get(itemId) ?? null }))
    .filter((r) => r.part)
    .sort((x, y) => y.qty - x.qty);

  const total = ranked.reduce((s, r) => s + r.qty, 0);
  let cum = 0;
  const rows: AbcRow[] = [];
  for (const r of ranked) {
    cum += r.qty;
    const share = (cum / total) * 100;
    const abcClass: AbcRow["abcClass"] = share <= 80 ? "A" : share <= 95 ? "B" : "C";
    rows.push({
      partId: r.part!.id,
      name: r.part!.name,
      article: r.part!.article,
      consumedQty: r.qty,
      cumulativeShare: share,
      abcClass,
    });
  }
  return rows;
}
