"use server";

// Replenishment / дозаказ actions (WMS Phase 5): set a part's per-item reorder
// policy and read the "to reorder" report. The host default (LOW_STOCK_THRESHOLD)
// is injected here — the lib/warehouse/replenishment domain stays host-agnostic.
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { TENANT_KEY, LOW_STOCK_THRESHOLD } from "@/lib/wms-host";
import {
  buildReorderReport,
  validateReorderPolicy,
  type ReorderReportRow,
} from "@/lib/warehouse/replenishment";

/**
 * Set (or clear) a part's reorder policy. Null clears the override → the item
 * falls back to the host default. Admin/manager only; server-authoritative
 * validation (integers ≥ 0, reorderUpTo ≥ reorderPoint).
 */
export async function setReorderPolicy(
  partId: string,
  reorderPoint: number | null,
  reorderUpTo: number | null,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);

  const validationError = validateReorderPolicy(reorderPoint, reorderUpTo);
  if (validationError) return { error: validationError };

  try {
    await db.stockItem.update({
      where: { partId },
      data: { reorderPoint, reorderUpTo },
    });
    return { error: null };
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2025") {
      return { error: "У этой запчасти нет складской позиции" };
    }
    throw e;
  }
}

/** The "to reorder" report — items at/below their effective reorder point. */
export async function getReorderReport(): Promise<ReorderReportRow[]> {
  await requireRole(["ADMIN", "MANAGER"]);
  return buildReorderReport(db, TENANT_KEY, LOW_STOCK_THRESHOLD);
}
