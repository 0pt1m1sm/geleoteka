/**
 * Verifies the supplier-order landed-cost math + server resolver:
 *  - lib/suppliers/landed-cost.ts: orderWeightGrams, computeShippingRub
 *    (divide-early), computeCustomsRub (PERCENT_CIF / CARGO_PER_KG), bounds.
 *  - lib/suppliers/resolve-landed-cost.ts: auto weight derived from DB
 *    Part.weightGrams (tamper-resistant), manual override, null-input path.
 *
 * Run: `npm run verify-landed-cost`. Exits 1 on failure.
 */

import "dotenv/config";
import { db } from "../lib/db";
import {
  orderWeightGrams,
  computeShippingRub,
  computeCustomsRub,
  isWithinLandedCostBounds,
  validateOrderLines,
  costResultWithinBounds,
  DEFAULT_CUSTOMS_PERCENT_BPS,
  MAX_WEIGHT_GRAMS,
  MAX_RATE_USD_CENTS,
  MAX_USD_RATE_KOPECKS,
  MAX_COST_RUB,
} from "../lib/suppliers/landed-cost";
import { resolveLandedCost } from "../lib/suppliers/resolve-landed-cost";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log("[verify-landed-cost] starting");

  // orderWeightGrams: Σ(weight×qty), null→0.
  const w = orderWeightGrams([
    { weightGrams: 2500, quantity: 2 },
    { weightGrams: null, quantity: 5 },
    { weightGrams: 1000, quantity: 1 },
  ]);
  assert(w === 6000, `orderWeightGrams should be 6000 (2500×2 + 0 + 1000), got ${w}`);
  console.log("  ✓ orderWeightGrams sums weighted lines, null weight → 0");

  // computeShippingRub: 2500 g, $8.50/kg (850¢), ₽92.50 (9250 kop) → round(1965.625) = 1966.
  const ship = computeShippingRub({ weightGrams: 2500, shippingRateUsdCents: 850, usdRateKopecks: 9250 });
  assert(ship === 1966, `shipping should be 1966 ₽, got ${ship}`);
  // Any null/0 input → 0.
  assert(computeShippingRub({ weightGrams: 0, shippingRateUsdCents: 850, usdRateKopecks: 9250 }) === 0, "zero weight → 0 shipping");
  assert(computeShippingRub({ weightGrams: 2500, shippingRateUsdCents: null, usdRateKopecks: 9250 }) === 0, "null rate → 0 shipping");
  console.log("  ✓ computeShippingRub: divide-early rounding; null/0 input → 0");

  // computeCustomsRub PERCENT_CIF: (100000 + 1966) × 26% = round(26511.16) = 26511.
  const cust = computeCustomsRub({
    mode: "PERCENT_CIF",
    itemsCostRub: 100000,
    shippingRub: 1966,
    customsPercentBps: DEFAULT_CUSTOMS_PERCENT_BPS,
  });
  assert(cust === 26511, `customs %CIF should be 26511 ₽, got ${cust}`);
  // CARGO_PER_KG mirrors the shipping formula with the cargo rate (2500 g, $4/kg=400¢, ₽92.50).
  const cargo = computeCustomsRub({
    mode: "CARGO_PER_KG",
    weightGrams: 2500,
    cargoRateUsdCents: 400,
    usdRateKopecks: 9250,
  });
  assert(cargo === computeShippingRub({ weightGrams: 2500, shippingRateUsdCents: 400, usdRateKopecks: 9250 }), `cargo customs matches shipping-shape, got ${cargo}`);
  assert(cargo === 925, `cargo customs should be 925 ₽ (2.5×4×92.5), got ${cargo}`);
  console.log("  ✓ computeCustomsRub: PERCENT_CIF and CARGO_PER_KG");

  // Bounds: in-range passes, out-of-range fails; max-bound shipping stays finite & sane.
  assert(isWithinLandedCostBounds({ weightGrams: 1000, shippingRateUsdCents: 850, usdRateKopecks: 9250, customsPercentBps: 2600, cargoRateUsdCents: 400 }), "typical inputs are within bounds");
  assert(!isWithinLandedCostBounds({ weightGrams: MAX_WEIGHT_GRAMS + 1 }), "weight above max rejected");
  assert(!isWithinLandedCostBounds({ shippingRateUsdCents: MAX_RATE_USD_CENTS + 1 }), "rate above max rejected");
  assert(!isWithinLandedCostBounds({ weightGrams: -1 }), "negative weight rejected");
  const maxShip = computeShippingRub({ weightGrams: MAX_WEIGHT_GRAMS, shippingRateUsdCents: MAX_RATE_USD_CENTS, usdRateKopecks: MAX_USD_RATE_KOPECKS });
  assert(Number.isFinite(maxShip) && Number.isSafeInteger(maxShip), `max-bound shipping must stay a safe integer, got ${maxShip}`);
  console.log("  ✓ bounds: in-range ok, out-of-range/negative rejected, max-bound stays safe-integer");

  // validateOrderLines: rejects tampered lines (negative qty, bad type, PART w/o partId, over-ceiling).
  assert(validateOrderLines([{ type: "PART", partId: "p1", quantity: 2, unitCost: 100 }]) === null, "valid PART line passes");
  assert(validateOrderLines([{ type: "PART", partId: "p1", quantity: -2, unitCost: 100 }]) !== null, "negative quantity rejected");
  assert(validateOrderLines([{ type: "PART", partId: null, quantity: 1, unitCost: 100 }]) !== null, "PART without partId rejected");
  assert(validateOrderLines([{ type: "BOGUS", quantity: 1, unitCost: 100 }]) !== null, "unknown line type rejected");
  assert(validateOrderLines([{ type: "CUSTOM", quantity: 1, unitCost: -5 }]) !== null, "negative unitCost rejected");
  assert(validateOrderLines([{ type: "CUSTOM", quantity: 1_000_000, unitCost: MAX_COST_RUB }]) !== null, "itemsCost over ceiling rejected");
  assert(validateOrderLines([]) !== null, "empty lines rejected");
  console.log("  ✓ validateOrderLines: rejects negative qty / bad type / missing partId / over-ceiling");

  // costResultWithinBounds: rejects over-ceiling resolved weight / totals.
  assert(costResultWithinBounds({ shippingWeightGrams: 5000, shippingCost: 3931, customsCost: 10642, totalCost: 51573 }), "in-bounds result ok");
  assert(!costResultWithinBounds({ shippingWeightGrams: MAX_WEIGHT_GRAMS + 1, shippingCost: 0, customsCost: 0, totalCost: 0 }), "over-weight result rejected");
  assert(!costResultWithinBounds({ shippingWeightGrams: 0, shippingCost: 0, customsCost: MAX_COST_RUB + 1, totalCost: MAX_COST_RUB + 1 }), "over-cost result rejected");
  console.log("  ✓ costResultWithinBounds: rejects over-ceiling weight/totals");

  // --- DB resolver: server-derived weight, tamper-resistance, override, null path ---
  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-LC-" } } });
  const partA = (await db.part.create({
    data: { slug: "verify-lc-a", article: "VERIFY-LC-A", name: "lc A", price: 100, weightGrams: 2500, stockItems: { create: { warehouseId: "wh_main_geleoteka" } } },
    select: { id: true },
  })) as { id: string };
  const partB = (await db.part.create({
    data: { slug: "verify-lc-b", article: "VERIFY-LC-B", name: "lc B", price: 100, weightGrams: 1000, stockItems: { create: { warehouseId: "wh_main_geleoteka" } } },
    select: { id: true },
  })) as { id: string };

  // Auto weight comes from the DB: 2500×2 + 1000×1 = 6000 g. There is NO client
  // weight parameter to forge — the resolver reads Part.weightGrams itself.
  const baseInput = {
    partLines: [
      { partId: partA.id, quantity: 2 },
      { partId: partB.id, quantity: 1 },
    ],
    itemsCostRub: 100000,
    manualWeightOverrideGrams: null,
    shippingRateUsdCents: 850,
    usdRateKopecks: 9250,
    customsMode: "PERCENT_CIF" as const,
    customsPercentBps: DEFAULT_CUSTOMS_PERCENT_BPS,
    cargoRateUsdCents: null,
  };
  const auto = await resolveLandedCost(db, baseInput);
  assert(auto.autoWeightGrams === 6000, `auto weight from DB should be 6000 g, got ${auto.autoWeightGrams}`);
  assert(auto.shippingWeightGrams === 6000, `no override → effective weight = auto 6000, got ${auto.shippingWeightGrams}`);
  // shipping = round(6 × 8.5 × 92.5) = 4718; customs = round((100000+4718)×26%) = 27227.
  assert(auto.shippingCost === 4718, `shipping should be 4718 ₽, got ${auto.shippingCost}`);
  assert(auto.customsCost === 27227, `customs %CIF should be 27227 ₽, got ${auto.customsCost}`);
  assert(auto.totalCost === 100000 + 4718 + 27227, `total mismatch, got ${auto.totalCost}`);
  console.log("  ✓ resolver derives auto weight from DB Part.weightGrams (no client weight to tamper)");

  // Explicit override is the ONLY way to change the weight; it is honored + stored.
  const overridden = await resolveLandedCost(db, { ...baseInput, manualWeightOverrideGrams: 3000 });
  assert(overridden.shippingWeightGrams === 3000, `override → effective weight 3000, got ${overridden.shippingWeightGrams}`);
  assert(overridden.autoWeightGrams === 6000, `auto weight still derived (6000) alongside override, got ${overridden.autoWeightGrams}`);
  assert(overridden.shippingCost === 2359, `override shipping = round(3×8.5×92.5) = 2359, got ${overridden.shippingCost}`);
  console.log("  ✓ resolver honors explicit manual weight override");

  // Null landed-cost inputs → shipping 0, customs 0, total = itemsCost.
  const nullInputs = await resolveLandedCost(db, {
    partLines: baseInput.partLines,
    itemsCostRub: 100000,
    manualWeightOverrideGrams: null,
    shippingRateUsdCents: null,
    usdRateKopecks: null,
    customsMode: "PERCENT_CIF",
    customsPercentBps: null,
    cargoRateUsdCents: null,
  });
  assert(nullInputs.shippingCost === 0 && nullInputs.customsCost === 0, "null inputs → 0 shipping/customs");
  assert(nullInputs.totalCost === 100000, `null inputs → total = itemsCost 100000, got ${nullInputs.totalCost}`);
  console.log("  ✓ resolver: all-null landed-cost inputs → total = itemsCost");

  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-LC-" } } });
  console.log("[verify-landed-cost] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-landed-cost] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
