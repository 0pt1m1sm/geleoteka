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

/** Строка заказа для разнесения ввозных затрат. */
export interface AllocatableLine {
  /** Ключ строки — id или индекс; возвращается как есть. */
  key: string;
  quantity: number;
  /** Цена закупки за единицу, ₽. */
  unitCost: number;
  /** Вес единицы, г. null — вес неизвестен. */
  weightGrams: number | null;
}

export interface AllocatedLine {
  key: string;
  /**
   * Итог строки с учётом ввоза, ₽. ТОЧНОЕ значение: сумма по строкам равна
   * сумме затрат до рубля. На нём считают деньги.
   */
  landedTotalCost: number;
  /**
   * Себестоимость единицы, ₽ — округлённая. Точной быть не может: итог строки
   * не всегда делится на количество нацело. На ней оценивают склад, где
   * остаток и так отличается от заказанного количества, и рубль на единицу
   * ничего не решает. Складывать её обратно вместо `landedTotalCost` нельзя —
   * разойдётся с суммой заказа.
   */
  landedUnitCost: number;
}

/**
 * Разнесение доставки и таможни на позиции заказа.
 *
 * Зачем. Доставка и таможня считались на уровне ЗАКАЗА и там и оставались, а
 * себестоимость позиции равнялась голой цене закупки. Оценка запасов брала
 * именно её, поэтому склад числился дешевле, чем стоил, а наценка выглядела
 * больше, чем есть: при таможне 26% и карго по доллару за килограмм разница
 * составляет десятки процентов. Для бизнеса «купил за рубежом — продал с
 * наценкой» это самая дорогая неточность из возможных.
 *
 * БАЗА РАЗНЕСЕНИЯ РАЗНАЯ у доставки и таможни, потому что они по-разному
 * возникают:
 *  • доставка берётся за килограмм → делим по ВЕСУ;
 *  • таможня в режиме процента от CIF берётся со стоимости → делим по
 *    СТОИМОСТИ; в режиме карго за килограмм — снова по весу.
 * Делить всё скопом по стоимости было бы проще и неверно: тяжёлая дешёвая
 * деталь получила бы копейки доставки, которую на самом деле оплатила она.
 *
 * ЗАПАСНОЙ ВАРИАНТ. Если суммарный вес нулевой или неизвестен, весовая база
 * непригодна, и делим по стоимости. Иначе вся доставка осела бы на одной
 * случайной строке или потерялась целиком.
 *
 * ОСТАТОК ОТ ОКРУГЛЕНИЯ отдаётся самой дорогой строке, а не размазывается:
 * сумма разнесённого обязана СОВПАДАТЬ с суммой затрат до рубля, иначе
 * себестоимость склада разойдётся с суммой заказов, и разойдётся молча.
 *
 * Возвращаются ДВА числа. Итог строки точен; цена единицы округлена, потому
 * что итог не всегда делится на количество нацело. Это не небрежность, а
 * предел целых рублей: складывать цены единиц вместо итогов нельзя.
 */
export function allocateLandedCost(input: {
  lines: AllocatableLine[];
  shippingCost: number;
  customsCost: number;
  customsMode: CustomsMode;
}): AllocatedLine[] {
  const { lines, shippingCost, customsCost, customsMode } = input;
  if (lines.length === 0) return [];

  const valueOf = (l: AllocatableLine): number => l.unitCost * l.quantity;
  const weightOf = (l: AllocatableLine): number => (l.weightGrams ?? 0) * l.quantity;

  const totalValue = lines.reduce((s, l) => s + valueOf(l), 0);
  const totalWeight = lines.reduce((s, l) => s + weightOf(l), 0);

  /** Разложить сумму по строкам пропорционально весам базы, без потери рубля. */
  function split(amount: number, basis: (l: AllocatableLine) => number): number[] {
    const weights = lines.map(basis);
    const total = weights.reduce((s, w) => s + w, 0);
    if (amount === 0) return lines.map(() => 0);
    // База непригодна (всё по нулям) — делим поровну: это честнее, чем
    // отдать всё первой строке.
    if (total <= 0) {
      const per = Math.floor(amount / lines.length);
      const out = lines.map(() => per);
      out[0] += amount - per * lines.length;
      return out;
    }
    const out = weights.map((w) => Math.floor((amount * w) / total));
    const remainder = amount - out.reduce((s, v) => s + v, 0);
    if (remainder !== 0) {
      // Самой дорогой строке: на ней округление заметно меньше в процентах.
      let idx = 0;
      for (let i = 1; i < lines.length; i++) if (valueOf(lines[i]) > valueOf(lines[idx])) idx = i;
      out[idx] += remainder;
    }
    return out;
  }

  const shippingBasis = totalWeight > 0 ? weightOf : valueOf;
  const customsBasis = customsMode === "CARGO_PER_KG" && totalWeight > 0 ? weightOf : valueOf;
  void totalValue;

  const shipping = split(shippingCost, shippingBasis);
  const customs = split(customsCost, customsBasis);

  return lines.map((l, i) => {
    const landedTotalCost = valueOf(l) + shipping[i] + customs[i];
    return {
      key: l.key,
      landedTotalCost,
      landedUnitCost: l.quantity > 0 ? Math.round(landedTotalCost / l.quantity) : landedTotalCost,
    };
  });
}
