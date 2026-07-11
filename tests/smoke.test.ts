import { describe, expect, it } from "vitest";

describe("vitest infra", () => {
  it("resolves the @ path alias against repo modules", async () => {
    const { OPEN_SUPPLIER_ORDER_STATUSES } = await import("@/lib/warehouse/incoming");
    expect(OPEN_SUPPLIER_ORDER_STATUSES).toContain("ORDERED");
  });
});
