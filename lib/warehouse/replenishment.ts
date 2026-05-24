/**
 * Replenishment / дозаказ domain (WMS Phase 5) — host-side, pure where possible.
 *
 * Per-item reorder policy lives on StockItem (reorderPoint / reorderUpTo, both
 * nullable; null = use the host default). This module computes the "to reorder"
 * report from those columns + incoming stock. It is host code: the WMS core
 * (lib/wms) neither imports it nor is depended on beyond `availableStock`.
 *
 * ⛔ Intentionally has NO `@/lib/wms-host` import — the default reorder point is
 *    injected by callers (the action layer and WarehouseOverview), so this stays
 *    a pure, unit-testable helper.
 */
import { availableStock } from "@/lib/wms/public";
import { incomingByPartIds } from "@/lib/warehouse/incoming";

/** Effective reorder trigger: the per-item column, or the injected default. */
export function effectiveReorderPoint(item: { reorderPoint: number | null }, defaultPoint: number): number {
  return item.reorderPoint ?? defaultPoint;
}

/** Effective order-up-to level: the per-item column, else the effective point
 *  (so "reorder up to the trigger" is the default when only the point is set). */
export function effectiveReorderUpTo(
  item: { reorderPoint: number | null; reorderUpTo: number | null },
  defaultPoint: number,
): number {
  return item.reorderUpTo ?? effectiveReorderPoint(item, defaultPoint);
}

/** Validate a reorder policy submission. Returns a user-facing error string, or
 *  null when valid. null values clear the override (fall back to the default). */
export function validateReorderPolicy(reorderPoint: number | null, reorderUpTo: number | null): string | null {
  for (const [v, label] of [
    [reorderPoint, "Точка дозаказа"],
    [reorderUpTo, "Дозаказ до"],
  ] as const) {
    if (v !== null && (!Number.isInteger(v) || v < 0)) {
      return `${label}: должно быть целым числом ≥ 0`;
    }
  }
  if (reorderPoint !== null && reorderUpTo !== null && reorderUpTo < reorderPoint) {
    return "«Дозаказ до» не может быть меньше точки дозаказа";
  }
  return null;
}

export interface ReorderReportRow {
  partId: string;
  name: string;
  article: string;
  available: number;
  incoming: number;
  /** Effective values (after default fallback) — what the report acts on. */
  reorderPoint: number;
  reorderUpTo: number;
  suggestedQty: number;
}

/** Structural port: only the delegates this module touches. The generated
 *  Prisma client (@ts-nocheck) is assignable; results are cast explicitly. */
interface ReplenishmentDb {
  part: { findMany: unknown };
  supplierOrderItem: { groupBy: unknown };
}

type PartFindManyFn = (args: unknown) => Promise<unknown>;

interface PartWithStock {
  id: string;
  name: string;
  article: string;
  stockItems: Array<{
    quantity: number;
    reserved: number;
    reorderPoint: number | null;
    reorderUpTo: number | null;
  }>;
}

/**
 * Build the "to reorder" report: every active part whose net stock
 * (available + incoming) is at or below its effective reorder point, with a
 * suggested order quantity of `max(1, effectiveReorderUpTo − net)` — the
 * clamp-to-1 guarantees an at-point item is never silently dropped. Sorted by
 * name. One batch `incomingByPartIds` groupBy — no N+1.
 */
export async function buildReorderReport(
  db: ReplenishmentDb,
  tenantKey: string,
  warehouseId: string,
  defaultPoint: number,
): Promise<ReorderReportRow[]> {
  const findMany = db.part.findMany as PartFindManyFn;
  const parts = (await findMany({
    // tenantKey/warehouseId live on StockItem (Part has none); scope via the
    // relation, which also requires a stock row to exist in this warehouse.
    where: { isActive: true, stockItems: { some: { tenantKey, warehouseId } } },
    select: {
      id: true,
      name: true,
      article: true,
      stockItems: {
        where: { warehouseId },
        select: { quantity: true, reserved: true, reorderPoint: true, reorderUpTo: true },
      },
    },
    orderBy: { name: "asc" },
  })) as PartWithStock[];

  const partIds = parts.map((p) => p.id);
  const incomingMap = await incomingByPartIds(db, partIds);

  const rows: ReorderReportRow[] = [];
  for (const p of parts) {
    const si = p.stockItems[0];
    if (!si) continue;
    const available = availableStock(si);
    const incoming = incomingMap.get(p.id) ?? 0;
    const net = available + incoming;
    const point = effectiveReorderPoint(si, defaultPoint);
    if (net > point) continue;
    const upTo = effectiveReorderUpTo(si, defaultPoint);
    rows.push({
      partId: p.id,
      name: p.name,
      article: p.article,
      available,
      incoming,
      reorderPoint: point,
      reorderUpTo: upTo,
      suggestedQty: Math.max(1, upTo - net),
    });
  }
  return rows;
}
