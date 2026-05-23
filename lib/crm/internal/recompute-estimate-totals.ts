import { db } from "@/lib/db";
import { recomputeDealTotals } from "./recompute-deal-totals";
import { computeEstimateMoney } from "./compute-estimate-money";

interface EstimateLineRow {
  type: string;
  total: number;
}

/**
 * Recompute Estimate money fields from its EstimateLine[] sums + its taxRate,
 * then cascade to the parent Deal (which sources its totals from the active
 * estimate — see `recomputeDealTotals`).
 *
 * Source of truth: EstimateLine.total + Estimate.taxRate. Estimate.total = sum
 * of all lines (DISCOUNT negative, FEE positive) + tax, where tax = round of
 * (post-discount goods subtotal × taxRate%). Channel-specific subtotals
 * partition LABOR / PART / RENTAL_DAY for reporting.
 *
 * The read→compute→write runs inside a single transaction that locks the
 * estimate row (`FOR UPDATE`) so concurrent recomputes (e.g. the editor's
 * row-autosave and tax-rate-autosave streams) serialize — the last one always
 * reads the current committed taxRate + lines and can't overwrite with stale
 * money fields.
 *
 * Internal helper — called by estimate-line actions and setEstimateTaxRate.
 */
export async function recomputeEstimateTotals(estimateId: string): Promise<void> {
  const dealId = await db.$transaction(async (tx) => {
    // Lock the estimate row first; serializes concurrent recomputes per estimate.
    await tx.$queryRaw`SELECT id FROM "Estimate" WHERE id = ${estimateId} FOR UPDATE`;

    const [lines, est] = (await Promise.all([
      tx.estimateLine.findMany({
        where: { estimateId },
        select: { type: true, total: true },
      }),
      tx.estimate.findUnique({
        where: { id: estimateId },
        select: { dealId: true, taxRate: true },
      }),
    ])) as [EstimateLineRow[], { dealId: string; taxRate: number } | null];

    const money = computeEstimateMoney(lines, est?.taxRate ?? 0);

    await tx.estimate.update({
      where: { id: estimateId },
      data: {
        subtotalLabor: money.subtotalLabor,
        subtotalParts: money.subtotalParts,
        subtotalRental: money.subtotalRental,
        discount: money.discount,
        tax: money.tax,
        total: money.total,
      },
    });

    return est?.dealId ?? null;
  });

  // Cascade to deal — its denormalized totals must stay in sync with
  // whichever of its estimates is currently active.
  if (dealId) await recomputeDealTotals(dealId);
}
