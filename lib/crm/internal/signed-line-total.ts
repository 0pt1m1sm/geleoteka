/**
 * DealLine / EstimateLine.total is signed: DISCOUNT lines reduce the total,
 * every other type adds. Managers enter discount amounts as positive
 * numbers (1 × 500 ₽ feels natural); the server normalises the stored
 * total + unitPrice so accumulation in recompute helpers is a straight SUM
 * and the print view shows a real "minus" sign.
 *
 * Pure utility — no DB, no I/O. Shared by app/actions/crm/deals.ts and
 * app/actions/crm/estimate-lines.ts.
 */
export function signedLineTotal(
  type: string,
  qty: number,
  unitPrice: number,
): { total: number; unitPrice: number } {
  const rawAbsPrice = Math.abs(unitPrice);
  const signedPrice = type === "DISCOUNT" ? -rawAbsPrice : rawAbsPrice;
  return {
    unitPrice: signedPrice,
    total: Math.round(qty * signedPrice),
  };
}
