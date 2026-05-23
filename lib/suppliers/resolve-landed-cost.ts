/**
 * Server-authoritative landed-cost resolution for a supplier order.
 *
 * The catalog weight that drives shipping is derived HERE from DB
 * `Part.weightGrams × quantity` — never taken from the client. The only
 * client-settable weight is the explicit `manualWeightOverrideGrams`, which is
 * stored. This is what makes the persisted ₽ totals tamper-resistant: a forged
 * request cannot silently change the auto weight or the money fields.
 *
 * No `requireRole` / session dependency, so it is exercised directly by
 * scripts/verify-landed-cost.ts against real seeded Parts.
 */

import {
  orderWeightGrams,
  computeShippingRub,
  computeCustomsRub,
  type CustomsMode,
} from "./landed-cost";

interface PartWeightClient {
  part: { findMany: unknown };
}
type FindManyFn = (args: unknown) => Promise<Array<{ id: string; weightGrams: number | null }>>;

export interface ResolveLandedCostInput {
  /** Resolved PART lines of the order (after any NEW_PART → draft Part creation). */
  partLines: Array<{ partId: string; quantity: number }>;
  itemsCostRub: number;
  manualWeightOverrideGrams: number | null;
  shippingRateUsdCents: number | null;
  usdRateKopecks: number | null;
  customsMode: CustomsMode;
  customsPercentBps: number | null;
  cargoRateUsdCents: number | null;
}

export interface ResolvedLandedCost {
  autoWeightGrams: number;
  /** Effective weight used = override ?? auto. */
  shippingWeightGrams: number;
  shippingCost: number;
  customsCost: number;
  totalCost: number;
}

export async function resolveLandedCost(
  client: PartWeightClient,
  input: ResolveLandedCostInput,
): Promise<ResolvedLandedCost> {
  const partIds = [...new Set(input.partLines.map((l) => l.partId))];
  const weightById = new Map<string, number | null>();
  if (partIds.length > 0) {
    const findMany = client.part.findMany as FindManyFn;
    const rows = await findMany({ where: { id: { in: partIds } }, select: { id: true, weightGrams: true } });
    for (const r of rows) weightById.set(r.id, r.weightGrams);
  }

  const autoWeightGrams = orderWeightGrams(
    input.partLines.map((l) => ({ weightGrams: weightById.get(l.partId) ?? null, quantity: l.quantity })),
  );
  const shippingWeightGrams = input.manualWeightOverrideGrams ?? autoWeightGrams;

  const shippingCost = computeShippingRub({
    weightGrams: shippingWeightGrams,
    shippingRateUsdCents: input.shippingRateUsdCents,
    usdRateKopecks: input.usdRateKopecks,
  });
  const customsCost =
    input.customsMode === "PERCENT_CIF"
      ? computeCustomsRub({ mode: "PERCENT_CIF", itemsCostRub: input.itemsCostRub, shippingRub: shippingCost, customsPercentBps: input.customsPercentBps })
      : computeCustomsRub({ mode: "CARGO_PER_KG", weightGrams: shippingWeightGrams, cargoRateUsdCents: input.cargoRateUsdCents, usdRateKopecks: input.usdRateKopecks });

  return {
    autoWeightGrams,
    shippingWeightGrams,
    shippingCost,
    customsCost,
    totalCost: input.itemsCostRub + shippingCost + customsCost,
  };
}
