/**
 * Pure landed-cost math for supplier orders. No I/O — fed already-resolved
 * inputs by the form preview and by the server-side resolver
 * (lib/suppliers/resolve-landed-cost.ts). Mirrors the pure-money pattern of
 * lib/crm/internal/compute-estimate-money.ts.
 *
 * Units: money results are whole rubles (Int). Inputs are scaled integers —
 * weight in grams, $/kg rates in USD cents (×100), the USD→RUB rate in kopecks
 * (×100), and the customs percentage in basis points (2600 = 26%).
 */

export const DEFAULT_CUSTOMS_PERCENT_BPS = 2600;

// Input ceilings. Chosen so the divide-early products stay well within
// Number.MAX_SAFE_INTEGER and the ruble results fit Postgres Int4.
export const MAX_WEIGHT_GRAMS = 50_000_000; // 50 t
export const MAX_RATE_USD_CENTS = 1_000_000; // $10,000/kg
export const MAX_USD_RATE_KOPECKS = 1_000_000; // ₽10,000/$
export const MAX_CUSTOMS_PERCENT_BPS = 100_000; // 1000%
export const MAX_COST_RUB = 2_000_000_000; // < Int4 max (2,147,483,647)
export const MAX_QUANTITY = 1_000_000;

export type CustomsMode = "PERCENT_CIF" | "CARGO_PER_KG";

interface WeightLine {
  weightGrams: number | null;
  quantity: number;
}

/** Σ(weightGrams × quantity); a null part weight contributes 0. */
export function orderWeightGrams(lines: WeightLine[]): number {
  return lines.reduce((sum, l) => sum + (l.weightGrams ?? 0) * l.quantity, 0);
}

interface ShippingInput {
  weightGrams: number | null;
  shippingRateUsdCents: number | null;
  usdRateKopecks: number | null;
}

/**
 * Shipping ₽ = kg × ($/kg) × (₽/$). Divides each factor down to its natural
 * unit BEFORE multiplying so the intermediate product never approaches
 * MAX_SAFE_INTEGER. Any missing/zero factor yields 0.
 */
export function computeShippingRub({ weightGrams, shippingRateUsdCents, usdRateKopecks }: ShippingInput): number {
  if (!weightGrams || !shippingRateUsdCents || !usdRateKopecks) return 0;
  return Math.round((weightGrams / 1000) * (shippingRateUsdCents / 100) * (usdRateKopecks / 100));
}

export type CustomsInput =
  | { mode: "PERCENT_CIF"; itemsCostRub: number; shippingRub: number; customsPercentBps: number | null }
  | { mode: "CARGO_PER_KG"; weightGrams: number | null; cargoRateUsdCents: number | null; usdRateKopecks: number | null };

/**
 * Customs ₽. PERCENT_CIF: percentage (basis points) of the CIF base
 * (itemsCost + shipping). CARGO_PER_KG: same shape as shipping, using the cargo
 * $/kg rate. Missing/zero inputs yield 0.
 */
export function computeCustomsRub(input: CustomsInput): number {
  if (input.mode === "CARGO_PER_KG") {
    return computeShippingRub({
      weightGrams: input.weightGrams,
      shippingRateUsdCents: input.cargoRateUsdCents,
      usdRateKopecks: input.usdRateKopecks,
    });
  }
  if (input.customsPercentBps == null) return 0;
  return Math.round(((input.itemsCostRub + input.shippingRub) * input.customsPercentBps) / 10_000);
}

/** Allowed supplier-order line types (NEW_PART is the UI-only draft-create marker). */
export const SUPPLIER_LINE_TYPES = ["PART", "NEW_PART", "CUSTOM", "FEE", "SERVICE"] as const;

export interface OrderLineShape {
  type: string;
  partId?: string | null;
  quantity: number;
  unitCost: number;
}

/**
 * Server-side validation of order lines before any cost computation — the form
 * already guards these, but a direct action call must not persist a negative
 * quantity (→ negative weight/cost) or an out-of-range amount. Returns a
 * user-facing error message, or null when every line is well-formed.
 */
export function validateOrderLines(lines: OrderLineShape[]): string | null {
  if (lines.length === 0) return "Нужна хотя бы одна позиция";
  let itemsCost = 0;
  for (const l of lines) {
    if (!(SUPPLIER_LINE_TYPES as readonly string[]).includes(l.type)) return "Недопустимый тип позиции";
    if (l.type === "PART" && !l.partId) return "Для позиции-запчасти не выбран товар";
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QUANTITY) return "Некорректное количество в позиции";
    if (!Number.isInteger(l.unitCost) || l.unitCost < 0 || l.unitCost > MAX_COST_RUB) return "Некорректная стоимость позиции";
    itemsCost += l.unitCost * l.quantity;
  }
  if (itemsCost > MAX_COST_RUB) return "Слишком большая сумма заказа";
  return null;
}

/** Guard the DB-derived weight and computed ₽ results against the Int4 / weight ceilings. */
export function costResultWithinBounds(r: {
  shippingWeightGrams: number;
  shippingCost: number;
  customsCost: number;
  totalCost: number;
}): boolean {
  if (!Number.isInteger(r.shippingWeightGrams) || r.shippingWeightGrams < 0 || r.shippingWeightGrams > MAX_WEIGHT_GRAMS) return false;
  return [r.shippingCost, r.customsCost, r.totalCost].every(
    (v) => Number.isSafeInteger(v) && v >= 0 && v <= MAX_COST_RUB,
  );
}

interface BoundsInput {
  weightGrams?: number | null;
  manualWeightOverrideGrams?: number | null;
  shippingRateUsdCents?: number | null;
  usdRateKopecks?: number | null;
  customsPercentBps?: number | null;
  cargoRateUsdCents?: number | null;
}

/** True when every provided input is a non-negative integer within its ceiling. */
export function isWithinLandedCostBounds(input: BoundsInput): boolean {
  const checks: Array<[number | null | undefined, number]> = [
    [input.weightGrams, MAX_WEIGHT_GRAMS],
    [input.manualWeightOverrideGrams, MAX_WEIGHT_GRAMS],
    [input.shippingRateUsdCents, MAX_RATE_USD_CENTS],
    [input.usdRateKopecks, MAX_USD_RATE_KOPECKS],
    [input.customsPercentBps, MAX_CUSTOMS_PERCENT_BPS],
    [input.cargoRateUsdCents, MAX_RATE_USD_CENTS],
  ];
  for (const [value, max] of checks) {
    if (value === null || value === undefined) continue;
    if (!Number.isInteger(value) || value < 0 || value > max) return false;
  }
  return true;
}
