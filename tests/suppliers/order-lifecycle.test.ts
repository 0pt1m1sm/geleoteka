import { describe, expect, it } from "vitest";
import {
  canDeleteOrder,
  canEditOrderMeta,
  canFullyEditOrder,
  isOrphanDraftPart,
} from "@/lib/suppliers/order-lifecycle";

describe("order lifecycle gates", () => {
  it("full edit is DRAFT-only", () => {
    expect(canFullyEditOrder("DRAFT")).toBe(true);
    for (const s of ["ORDERED", "IN_TRANSIT", "CUSTOMS", "PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED", "CANCELLED"]) {
      expect(canFullyEditOrder(s)).toBe(false);
    }
  });

  it("meta edit is allowed everywhere except terminal manual states", () => {
    for (const s of ["DRAFT", "ORDERED", "IN_TRANSIT", "CUSTOMS", "PARTIALLY_RECEIVED", "RECEIVED"]) {
      expect(canEditOrderMeta(s)).toBe(true);
    }
    expect(canEditOrderMeta("COMPLETED")).toBe(false);
    expect(canEditOrderMeta("CANCELLED")).toBe(false);
  });

  it("delete requires DRAFT and zero receipts on every line (belt-and-suspenders)", () => {
    expect(canDeleteOrder("DRAFT", [{ receivedQuantity: 0 }, { receivedQuantity: 0 }])).toBe(true);
    expect(canDeleteOrder("DRAFT", [])).toBe(true);
    expect(canDeleteOrder("DRAFT", [{ receivedQuantity: 1 }])).toBe(false);
    expect(canDeleteOrder("ORDERED", [{ receivedQuantity: 0 }])).toBe(false);
  });
});

describe("isOrphanDraftPart — GC predicate for NEW_PART drafts", () => {
  const orphan = {
    isActive: false,
    price: 0,
    movementCount: 0,
    placedQty: 0,
    otherSupplierLineCount: 0,
    estimateLineCount: 0,
    partLineCount: 0,
    partOrderItemCount: 0,
  };

  it("a hidden zero-price part with zero references is an orphan", () => {
    expect(isOrphanDraftPart(orphan)).toBe(true);
  });

  it("any activity or reference keeps the part", () => {
    expect(isOrphanDraftPart({ ...orphan, isActive: true })).toBe(false); // published to the shop
    expect(isOrphanDraftPart({ ...orphan, price: 500 })).toBe(false); // priced — not a draft anymore
    expect(isOrphanDraftPart({ ...orphan, movementCount: 1 })).toBe(false); // stock history exists
    expect(isOrphanDraftPart({ ...orphan, placedQty: 2 })).toBe(false); // physically in a bin
    expect(isOrphanDraftPart({ ...orphan, otherSupplierLineCount: 1 })).toBe(false); // on another order
    expect(isOrphanDraftPart({ ...orphan, estimateLineCount: 1 })).toBe(false); // quoted to a customer
    expect(isOrphanDraftPart({ ...orphan, partLineCount: 1 })).toBe(false); // in a shipment
    expect(isOrphanDraftPart({ ...orphan, partOrderItemCount: 1 })).toBe(false); // in a legacy part order
  });
});
