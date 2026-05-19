import { db } from "@/lib/db";
import { recomputeDealTotals } from "@/lib/crm/internal/recompute-deal-totals";
import { nextDealNumber, nextEstimateNumber } from "@/lib/crm/internal/next-number";
import type { CreateDealInput, DealSummary } from "./types";

/**
 * Create a Deal with optional initial lines, in a single transaction.
 *
 * Other modules call this when their flow originates a commercial
 * transaction:
 *  - Service booking → createDeal({channel: SERVICE, source: "booking-form"})
 *  - Parts cart checkout → createDeal({channel: PARTS_RETAIL, initialStage: IN_PROGRESS, lines: [...]})
 *  - Rentals booking → createDeal({channel: RENTAL, initialStage: IN_PROGRESS, lines: [...]})
 *
 * The caller is responsible for creating its own fulfillment row
 * (RepairOrder / PartOrder / RentalBooking) and setting that row's
 * `dealId` to the returned deal id.
 */
export async function createDeal(input: CreateDealInput): Promise<DealSummary> {
  const dealId = await db.$transaction(async (tx) => {
    const [dealNumber, estimateNumber] = await Promise.all([
      nextDealNumber(tx),
      nextEstimateNumber(tx),
    ]);

    const deal = (await tx.deal.create({
      data: {
        customerUserId: input.customerUserId,
        vehicleId: input.vehicleId ?? null,
        ownerUserId: input.ownerUserId ?? null,
        channel: input.channel,
        source: input.source,
        stage: input.initialStage ?? "NEW",
        claimToken: input.claimToken ?? null,
        notes: input.notes ?? null,
        number: dealNumber,
      },
      select: { id: true },
    })) as { id: string };

    // Every deal gets an initial DRAFT estimate. This is the working
    // basket — the manager edits its lines until ready to send. Lines
    // passed by booking/parts/rentals callers populate this DRAFT.
    const estimate = (await tx.estimate.create({
      data: {
        dealId: deal.id,
        stage: "DRAFT",
        number: estimateNumber,
      },
      select: { id: true },
    })) as { id: string };

    if (input.lines && input.lines.length > 0) {
      await tx.estimateLine.createMany({
        data: input.lines.map((line, i) => ({
          estimateId: estimate.id,
          sortOrder: line.sortOrder ?? i,
          type: line.type,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          total: Math.round(line.qty * line.unitPrice),
          partId: line.partId ?? null,
        })),
      });
    }

    return deal.id;
  });

  // Recompute outside the transaction — single follow-up roundtrip is
  // simpler than threading the tx into recomputeDealTotals.
  await recomputeDealTotals(dealId);

  const full = (await db.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      number: true,
      customerUserId: true,
      vehicleId: true,
      ownerUserId: true,
      stage: true,
      channel: true,
      total: true,
      createdAt: true,
      updatedAt: true,
    },
  })) as DealSummary;
  return full;
}
