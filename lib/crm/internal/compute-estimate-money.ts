interface MoneyLine {
  type: string;
  total: number; // signed: DISCOUNT negative, others positive
}

export interface EstimateMoney {
  subtotalLabor: number;
  subtotalParts: number;
  subtotalRental: number;
  discount: number;
  tax: number;
  total: number;
}

/**
 * Pure money math for an estimate (and the deal that mirrors its active
 * estimate). Tax is a percentage of the post-discount goods subtotal:
 *
 *   base  = max(0, subtotalLabor + subtotalParts + subtotalRental + discount)
 *   tax   = round(base × taxRate / 100)
 *   total = Σ all line totals (incl. FEE and the negative DISCOUNT) + tax
 *
 * FEE lines contribute to `total` but are never part of the taxable base.
 * No I/O — both recompute helpers feed it `EstimateLine` rows + the rate.
 */
export function computeEstimateMoney(lines: MoneyLine[], taxRate: number): EstimateMoney {
  let subtotalLabor = 0;
  let subtotalParts = 0;
  let subtotalRental = 0;
  let discount = 0;
  let linesTotal = 0;

  for (const l of lines) {
    linesTotal += l.total;
    switch (l.type) {
      case "LABOR":
        subtotalLabor += l.total;
        break;
      case "PART":
        subtotalParts += l.total;
        break;
      case "RENTAL_DAY":
        subtotalRental += l.total;
        break;
      case "DISCOUNT":
        discount += l.total;
        break;
      // FEE contributes to linesTotal only.
    }
  }

  const base = Math.max(0, subtotalLabor + subtotalParts + subtotalRental + discount);
  const tax = Math.round((base * (taxRate || 0)) / 100);

  return { subtotalLabor, subtotalParts, subtotalRental, discount, tax, total: linesTotal + tax };
}
