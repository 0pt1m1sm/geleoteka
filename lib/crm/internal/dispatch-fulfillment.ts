import { db } from "@/lib/db";
import { nextRepairOrderNumber, nextPartOrderNumber } from "./next-number";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export interface DispatchFulfillmentInput {
  dealId: string;
  channel: string;
  customerUserId: string;
  vehicleId: string | null;
  contact: { name: string; phone: string; email: string };
  /** Total of the approved estimate — seeds the PartShipment.total. */
  estimateTotal: number;
  hasRepairOrder: boolean;
  hasPartShipment: boolean;
}

export interface DispatchFulfillmentResult {
  /** Id of the fulfillment created, or null when none was created. */
  createdId: string | null;
  createdType: "RepairOrder" | "PartShipment" | null;
  /** Non-fatal reason a fulfillment was intentionally NOT created. */
  warning?: string;
}

/**
 * On estimate approval, create the fulfillment row matching the deal channel
 * if one does not already exist. Runs inside the approve transaction (caller
 * passes `tx`).
 *
 * - SERVICE            → RepairOrder (skipped with a warning if the deal has no vehicle)
 * - PARTS_RETAIL/_WHOLESALE → PartShipment
 * - RENTAL             → no-op (the booking is created at booking time)
 * - WALK_IN            → no-op (no downstream fulfillment)
 *
 * Idempotent: the caller passes hasRepairOrder/hasPartShipment so a deal that
 * already has its fulfillment is left untouched.
 */
export async function dispatchFulfillment(
  tx: Tx,
  input: DispatchFulfillmentInput,
): Promise<DispatchFulfillmentResult> {
  switch (input.channel) {
    case "SERVICE": {
      if (input.hasRepairOrder) return { createdId: null, createdType: null };
      if (!input.vehicleId) {
        return {
          createdId: null,
          createdType: null,
          warning: "SERVICE deal has no vehicle — RepairOrder not auto-created",
        };
      }
      const roNumber = await nextRepairOrderNumber(tx);
      const ro = (await tx.repairOrder.create({
        data: {
          roNumber,
          userId: input.customerUserId,
          vehicleId: input.vehicleId,
          dealId: input.dealId,
          dateTime: new Date(),
          status: "SCHEDULED",
        },
        select: { id: true },
      })) as { id: string };
      return { createdId: ro.id, createdType: "RepairOrder" };
    }

    case "PARTS_RETAIL":
    case "PARTS_WHOLESALE": {
      if (input.hasPartShipment) return { createdId: null, createdType: null };
      const orderNumber = await nextPartOrderNumber(tx);
      const ps = (await tx.partShipment.create({
        data: {
          orderNumber,
          userId: input.customerUserId,
          dealId: input.dealId,
          total: input.estimateTotal,
          contactName: input.contact.name,
          contactPhone: input.contact.phone,
          contactEmail: input.contact.email,
          status: "PROCESSING",
        },
        select: { id: true },
      })) as { id: string };
      return { createdId: ps.id, createdType: "PartShipment" };
    }

    default:
      // RENTAL fulfillment is created at booking time; WALK_IN has none.
      return { createdId: null, createdType: null };
  }
}
