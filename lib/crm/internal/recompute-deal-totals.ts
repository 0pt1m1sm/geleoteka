import { db } from "@/lib/db";

interface EstimateLineRow {
  type: string;
  total: number;
}

/**
 * Recompute Deal money fields from its **active estimate's** EstimateLine[]
 * sums. The active estimate is the latest non-SUPERSEDED row for the deal —
 * preferring DRAFT (working state) over APPROVED over SENT, then anything
 * else by createdAt desc. SUPERSEDED estimates never contribute totals.
 *
 * Source of truth: EstimateLine.total. Deal.total = sum of all lines
 * (including DISCOUNT, which is negative, and FEE). Channel-specific
 * subtotals partition LABOR / PART / RENTAL_DAY for reporting.
 *
 * If a deal has no estimates at all (transient state during creation, or
 * legacy rows pre-refactor), all totals reset to zero.
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

  const estimates = (await db.estimate.findMany({
    where: { dealId, stage: { not: "SUPERSEDED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, stage: true, createdAt: true },
  })) as Array<{ id: string; stage: string; createdAt: Date }>;

  // Sort by stage priority (desc), then createdAt (desc).
  estimates.sort((a, b) => {
    const pa = stagePriority[a.stage] ?? 0;
    const pb = stagePriority[b.stage] ?? 0;
    if (pa !== pb) return pb - pa;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const active = estimates[0];

  let subtotalLabor = 0;
  let subtotalParts = 0;
  let subtotalRental = 0;
  let discount = 0;
  let total = 0;

  if (active) {
    const lines = (await db.estimateLine.findMany({
      where: { estimateId: active.id },
      select: { type: true, total: true },
    })) as EstimateLineRow[];

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
        // FEE contributes to total only.
      }
    }
  }

  await db.deal.update({
    where: { id: dealId },
    data: { subtotalLabor, subtotalParts, subtotalRental, discount, total },
  });
}
