import { db } from "@/lib/db";
import { recomputeDealTotals } from "./recompute-deal-totals";

interface EstimateLineRow {
  type: string;
  total: number;
}

/**
 * Recompute Estimate money fields from its EstimateLine[] sums, then
 * cascade to the parent Deal (which sources its totals from the active
 * estimate — see `recomputeDealTotals`).
 *
 * Source of truth: EstimateLine.total. Estimate.total = sum of all lines
 * (including DISCOUNT, which is negative, and FEE). Channel-specific
 * subtotals partition LABOR / PART / RENTAL_DAY for reporting.
 *
 * Internal helper — called by estimate-line actions (add / update / delete).
 */
export async function recomputeEstimateTotals(estimateId: string): Promise<void> {
  const [lines, est] = (await Promise.all([
    db.estimateLine.findMany({
      where: { estimateId },
      select: { type: true, total: true },
    }),
    db.estimate.findUnique({
      where: { id: estimateId },
      select: { dealId: true },
    }),
  ])) as [EstimateLineRow[], { dealId: string } | null];

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

  // Cascade to deal — its denormalized totals must stay in sync with
  // whichever of its estimates is currently active.
  if (est) await recomputeDealTotals(est.dealId);
}
