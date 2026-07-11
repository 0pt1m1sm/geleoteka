import { describe, expect, it } from "vitest";
import {
  computeCustomsRub,
  computeShippingRub,
  costResultWithinBounds,
  isWithinLandedCostBounds,
  orderWeightGrams,
  validateOrderLines,
  MAX_COST_RUB,
  MAX_QUANTITY,
  MAX_RATE_USD_CENTS,
  MAX_WEIGHT_GRAMS,
} from "@/lib/suppliers/landed-cost";

describe("orderWeightGrams", () => {
  it("sums weight × quantity and treats null weights as 0", () => {
    expect(
      orderWeightGrams([
        { weightGrams: 1500, quantity: 2 },
        { weightGrams: null, quantity: 10 },
        { weightGrams: 250, quantity: 4 },
      ]),
    ).toBe(4000);
  });

  it("is 0 for an empty order", () => {
    expect(orderWeightGrams([])).toBe(0);
  });
});

describe("computeShippingRub", () => {
  it("computes kg × $/kg × ₽/$ with scaled-integer inputs", () => {
    // 12.5 kg × $8.40/kg × 92.50 ₽/$ = 9712.5 → rounds to 9713 ₽
    expect(computeShippingRub({ weightGrams: 12_500, shippingRateUsdCents: 840, usdRateKopecks: 9250 })).toBe(9713);
  });

  it("yields 0 when any factor is missing or zero", () => {
    expect(computeShippingRub({ weightGrams: 0, shippingRateUsdCents: 840, usdRateKopecks: 9250 })).toBe(0);
    expect(computeShippingRub({ weightGrams: 1000, shippingRateUsdCents: null, usdRateKopecks: 9250 })).toBe(0);
    expect(computeShippingRub({ weightGrams: 1000, shippingRateUsdCents: 840, usdRateKopecks: null })).toBe(0);
  });
});

describe("computeCustomsRub", () => {
  it("PERCENT_CIF: percentage (bps) of items + shipping", () => {
    // (100000 + 20000) × 2600 bps = 26% → 31200 ₽
    expect(
      computeCustomsRub({ mode: "PERCENT_CIF", itemsCostRub: 100_000, shippingRub: 20_000, customsPercentBps: 2600 }),
    ).toBe(31_200);
  });

  it("PERCENT_CIF: null percentage yields 0", () => {
    expect(computeCustomsRub({ mode: "PERCENT_CIF", itemsCostRub: 100_000, shippingRub: 0, customsPercentBps: null })).toBe(0);
  });

  it("CARGO_PER_KG mirrors the shipping formula on the cargo rate", () => {
    expect(
      computeCustomsRub({ mode: "CARGO_PER_KG", weightGrams: 10_000, cargoRateUsdCents: 500, usdRateKopecks: 10_000 }),
    ).toBe(5000); // 10 kg × $5 × 100 ₽/$
  });
});

describe("validateOrderLines", () => {
  const good = { type: "PART", partId: "p1", quantity: 1, unitCost: 100 };

  it("accepts a well-formed order", () => {
    expect(validateOrderLines([good, { type: "FEE", quantity: 1, unitCost: 500 }])).toBeNull();
  });

  it("rejects an empty order", () => {
    expect(validateOrderLines([])).toBe("Нужна хотя бы одна позиция");
  });

  it("rejects unknown line types and PART lines without a part", () => {
    expect(validateOrderLines([{ ...good, type: "WEIRD" }])).toBe("Недопустимый тип позиции");
    expect(validateOrderLines([{ ...good, partId: null }])).toBe("Для позиции-запчасти не выбран товар");
  });

  it("rejects non-integer, non-positive and over-limit quantities", () => {
    expect(validateOrderLines([{ ...good, quantity: 0 }])).toBe("Некорректное количество в позиции");
    expect(validateOrderLines([{ ...good, quantity: 1.5 }])).toBe("Некорректное количество в позиции");
    expect(validateOrderLines([{ ...good, quantity: MAX_QUANTITY + 1 }])).toBe("Некорректное количество в позиции");
  });

  it("rejects negative / out-of-range unit costs and an over-limit order total", () => {
    expect(validateOrderLines([{ ...good, unitCost: -1 }])).toBe("Некорректная стоимость позиции");
    expect(validateOrderLines([{ ...good, unitCost: MAX_COST_RUB + 1 }])).toBe("Некорректная стоимость позиции");
    // Two lines individually within bounds whose SUM overflows the ceiling.
    expect(
      validateOrderLines([
        { type: "CUSTOM", quantity: 1, unitCost: MAX_COST_RUB },
        { type: "CUSTOM", quantity: 1, unitCost: 1 },
      ]),
    ).toBe("Слишком большая сумма заказа");
  });
});

describe("bounds guards", () => {
  it("isWithinLandedCostBounds accepts absent inputs and in-range values", () => {
    expect(isWithinLandedCostBounds({})).toBe(true);
    expect(isWithinLandedCostBounds({ shippingRateUsdCents: MAX_RATE_USD_CENTS, usdRateKopecks: 1 })).toBe(true);
  });

  it("isWithinLandedCostBounds rejects negative, non-integer and over-max values", () => {
    expect(isWithinLandedCostBounds({ shippingRateUsdCents: -1 })).toBe(false);
    expect(isWithinLandedCostBounds({ usdRateKopecks: 1.5 })).toBe(false);
    expect(isWithinLandedCostBounds({ manualWeightOverrideGrams: MAX_WEIGHT_GRAMS + 1 })).toBe(false);
  });

  it("costResultWithinBounds guards the computed results against the Int4 / weight ceilings", () => {
    const ok = { shippingWeightGrams: 1000, shippingCost: 100, customsCost: 50, totalCost: 150 };
    expect(costResultWithinBounds(ok)).toBe(true);
    expect(costResultWithinBounds({ ...ok, totalCost: MAX_COST_RUB + 1 })).toBe(false);
    expect(costResultWithinBounds({ ...ok, shippingWeightGrams: MAX_WEIGHT_GRAMS + 1 })).toBe(false);
    expect(costResultWithinBounds({ ...ok, customsCost: -1 })).toBe(false);
  });
});
