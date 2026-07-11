import type { MovementReason } from "../public/types";

/**
 * Maps a reason + qty to the signed (on-hand, reserved) deltas. The only place
 * the stock arithmetic lives.
 *
 * - RECEIPT           +qty on-hand
 * - RECEIPT_REVERSAL  −qty on-hand (сторно of an erroneous receipt; reserved untouched)
 * - CONSUMPTION       −qty on-hand AND −qty reserved (the hold becomes physical removal;
 *                     the caller clamps the reserved release so reserved never goes < 0)
 * - ADJUSTMENT        ±qty on-hand (qty is a signed delta for this reason only)
 * - RESERVATION       +qty reserved
 * - RELEASE           −qty reserved
 */
export function deltasForReason(
  reason: MovementReason,
  qty: number,
): { quantityDelta: number; reservedDelta: number } {
  switch (reason) {
    case "RECEIPT":
      return { quantityDelta: qty, reservedDelta: 0 };
    case "RECEIPT_REVERSAL":
      return { quantityDelta: -qty, reservedDelta: 0 };
    case "CONSUMPTION":
      return { quantityDelta: -qty, reservedDelta: -qty };
    case "ADJUSTMENT":
      return { quantityDelta: qty, reservedDelta: 0 };
    case "RESERVATION":
      return { quantityDelta: 0, reservedDelta: qty };
    case "RELEASE":
      return { quantityDelta: 0, reservedDelta: -qty };
  }
}
