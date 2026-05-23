import { db } from "@/lib/db";
import { computeEstimateMoney } from "./compute-estimate-money";

interface EstimateLineRow {
  type: string;
  total: number;
}

/**
 * Recompute Deal money fields from its **active estimate's** EstimateLine[]
 * sums + that estimate's taxRate. The active estimate is the latest
 * non-SUPERSEDED row for the deal — preferring DRAFT (working state) over
 * APPROVED over SENT, then anything else by createdAt desc. SUPERSEDED
 * estimates never contribute totals.
 *
 * Source of truth: EstimateLine.total + the active Estimate.taxRate.
 * Deal.total = Σ all lines (DISCOUNT negative, FEE positive) + tax, where tax =
 * round(post-discount goods subtotal × taxRate%). If a deal has no estimates,
 * all totals (incl. tax) reset to zero.
 *
 * The read→compute→write runs inside a transaction that locks the deal row
 * (`FOR UPDATE`) so concurrent recomputes serialize and the last one writes
 * the current committed state (no stale-overwrite — see recompute-estimate-totals).
 *
 * Internal helper — called by every action that mutates EstimateLine and by
 * createDeal once after the initial DRAFT is populated.
 */
export async function recomputeDealTotals(dealId: string): Promise<void> {
  // Stage priority for "active": DRAFT > APPROVED > SENT > DECLINED/EXPIRED.
  // We pick the single most-relevant estimate; SUPERSEDED is always skipped.
  const stagePriority: Record<string, number> = {
    DRAFT: 4,
    APPROVED: 3,
    SENT: 2,
    DECLINED: 1,
    EXPIRED: 1,
  };

  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Deal" WHERE id = ${dealId} FOR UPDATE`;

    const estimates = (await tx.estimate.findMany({
      where: { dealId, stage: { not: "SUPERSEDED" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, stage: true, createdAt: true, taxRate: true },
    })) as Array<{ id: string; stage: string; createdAt: Date; taxRate: number }>;

    estimates.sort((a, b) => {
      const pa = stagePriority[a.stage] ?? 0;
      const pb = stagePriority[b.stage] ?? 0;
      if (pa !== pb) return pb - pa;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const active = estimates[0];

    if (!active) {
      await tx.deal.update({
        where: { id: dealId },
        data: { subtotalLabor: 0, subtotalParts: 0, subtotalRental: 0, discount: 0, tax: 0, total: 0 },
      });
      return;
    }

    const lines = (await tx.estimateLine.findMany({
      where: { estimateId: active.id },
      select: { type: true, total: true },
    })) as EstimateLineRow[];

    const money = computeEstimateMoney(lines, active.taxRate ?? 0);

    await tx.deal.update({
      where: { id: dealId },
      data: {
        subtotalLabor: money.subtotalLabor,
        subtotalParts: money.subtotalParts,
        subtotalRental: money.subtotalRental,
        discount: money.discount,
        tax: money.tax,
        total: money.total,
      },
    });
  });
}
