import { db } from "@/lib/db";

interface EstimateLineRow {
  type: string;
  total: number;
}

/**
 * Recompute Estimate money fields from its EstimateLine[] sums.
 *
 * Source of truth: EstimateLine.total. Estimate.total = sum of all lines
 * (including DISCOUNT, which is negative, and FEE). Channel-specific
 * subtotals partition LABOR / PART / RENTAL_DAY for reporting.
 *
 * Internal helper — callers are CRM estimate-line actions (addEstimateLine,
 * updateEstimateLine, deleteEstimateLine). The parent Deal is NOT touched
 * — Estimate is a frozen snapshot whose money lives independently.
 */
export async function recomputeEstimateTotals(estimateId: string): Promise<void> {
  const lines = (await db.estimateLine.findMany({
    where: { estimateId },
    select: { type: true, total: true },
  })) as EstimateLineRow[];

  let subtotalLabor = 0;
  let subtotalParts = 0;
  let subtotalRental = 0;
  let discount = 0;
  let total = 0;

  for (const l of lines) {
    total += l.total;
    switch (l.type) {
      case "LABOR":
        subtotalLabor += l.total;
        break;
      case "PART":
        subtotalParts += l.total;
        break;
      case "RENTAL_DAY":
        subtotalRental += l.total;
        break;
      case "DISCOUNT":
        discount += l.total;
        break;
    }
  }

  await db.estimate.update({
    where: { id: estimateId },
    data: { subtotalLabor, subtotalParts, subtotalRental, discount, total },
  });
}
