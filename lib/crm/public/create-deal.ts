import { db } from "@/lib/db";
import { recomputeDealTotals } from "@/lib/crm/internal/recompute-deal-totals";
import type { CreateDealInput, DealSummary } from "./types";

/**
 * Create a Deal with optional initial lines, in a single transaction.
 *
 * Other modules call this when their flow originates a commercial
 * transaction:
 *  - Service booking → createDeal({channel: SERVICE, source: "booking-form"})
 *  - Parts cart checkout → createDeal({channel: PARTS_RETAIL, initialStage: APPROVED, lines: [...]})
 *  - Rentals booking → createDeal({channel: RENTAL, initialStage: APPROVED, lines: [...]})
 *
 * The caller is responsible for creating its own fulfillment row
 * (RepairOrder / PartOrder / RentalBooking) and setting that row's
 * `dealId` to the returned deal id.
 */
export async function createDeal(input: CreateDealInput): Promise<DealSummary> {
  const dealId = await db.$transaction(async (tx) => {
    const deal = (await tx.deal.create({
      data: {
        customerUserId: input.customerUserId,
        vehicleId: input.vehicleId ?? null,
        ownerUserId: input.ownerUserId ?? null,
        channel: input.channel,
        source: input.source,
        stage: input.initialStage ?? "DRAFT",
        claimToken: input.claimToken ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true },
    })) as { id: string };

    if (input.lines && input.lines.length > 0) {
      await tx.dealLine.createMany({
        data: input.lines.map((line, i) => ({
          dealId: deal.id,
          sortOrder: line.sortOrder ?? i,
          type: line.type,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          total: Math.round(line.qty * line.unitPrice),
          partId: line.partId ?? null,
          vehicleId: line.vehicleId ?? null,
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
