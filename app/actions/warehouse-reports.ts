"use server";

// WMS Phase 6 report actions: stock valuation + dead-stock/ABC analysis.
// The host tenant key is injected here; the lib/warehouse report helpers stay
// host-agnostic.
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { TENANT_KEY, defaultWarehouseId } from "@/lib/wms-host";
import { buildValuationReport, type ValuationReport } from "@/lib/warehouse/valuation";
import { deadStock, abcAnalysis, type DeadStockRow, type AbcRow } from "@/lib/warehouse/stock-analysis";

/** Stock valuation report (on-hand × latest purchase unit cost). Admin/manager.
 *  Scoped to `warehouseId` (default warehouse when omitted). */
export async function getValuationReport(warehouseId?: string): Promise<ValuationReport> {
  await requireRole(["ADMIN", "MANAGER"]);
  return buildValuationReport(db, TENANT_KEY, warehouseId ?? (await defaultWarehouseId(db)));
}

/** Dead-stock + ABC analysis over `windowDays` (clamped 1..3650). Admin/manager. */
export async function getStockAnalysis(
  windowDays = 90,
  warehouseIdArg?: string,
): Promise<{ windowDays: number; deadStock: DeadStockRow[]; abc: AbcRow[] }> {
  await requireRole(["ADMIN", "MANAGER"]);
  const w = Math.min(3650, Math.max(1, Math.trunc(Number(windowDays) || 90)));
  const warehouseId = warehouseIdArg ?? (await defaultWarehouseId(db));
  const [dead, abc] = await Promise.all([
    deadStock(db, TENANT_KEY, warehouseId, w),
    abcAnalysis(db, TENANT_KEY, warehouseId, w),
  ]);
  return { windowDays: w, deadStock: dead, abc };
}
