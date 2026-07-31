import { db } from "@/lib/db";
import { nextRepairOrderNumber, nextPartOrderNumber } from "./next-number";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export interface DispatchFulfillmentInput {
  dealId: string;
  channel: string;
  /** Null when the customer was erased and the deal kept, detached. */
  customerUserId: string | null;
  vehicleId: string | null;
  /** Null for the same reason — there is nobody to address the shipment to. */
  contact: { name: string; phone: string; email: string } | null;
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
      // A detached deal has nobody to book the work for. Creating the order
      // anyway would mint a permanently ownerless record; failing loudly would
      // block an operator who is only trying to close out old paperwork. Refuse
      // the way a missing vehicle is refused — visibly, without blowing up.
      if (!input.customerUserId) {
        return {
          createdId: null,
          createdType: null,
          warning: "У сделки нет клиента (был удалён) — заказ-наряд не создан",
        };
      }
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
      // Same reasoning as SERVICE: no customer means no address to ship to, and
      // `PartShipment.userId` is not nullable anyway.
      if (!input.customerUserId || !input.contact) {
        return {
          createdId: null,
          createdType: null,
          warning: "У сделки нет клиента (был удалён) — отгрузка не создана",
        };
      }
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
