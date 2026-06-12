import type { DbClientPort } from "@/lib/wms/public";
import { TENANT_KEY, defaultWarehouseId } from "@/lib/wms-host";

/** Thrown when a barcode/gtin is already held by another StockItem. */
export class DuplicateCodeError extends Error {
  constructor(public readonly field: "barcode" | "gtin") {
    super(`DUPLICATE_${field.toUpperCase()}`);
    this.name = "DuplicateCodeError";
  }
}

/**
 * Assign or clear a part's `barcode` and `gtin` on its StockItem, enforcing
 * per-field uniqueness within the tenant (StockItem.barcode is a non-unique
 * index, so the guard is at the app level). Empty/null clears the field.
 * Throws `DuplicateCodeError` when another item already holds the code.
 */
export async function assignCodes(
  client: DbClientPort,
  partId: string,
  barcode: string | null,
  gtin: string | null,
): Promise<void> {
  if (barcode) {
    const dupe = await client.stockItem.findFirst({
      where: { tenantKey: TENANT_KEY, barcode, partId: { not: partId } },
      select: { id: true },
    });
    if (dupe) throw new DuplicateCodeError("barcode");
  }
  if (gtin) {
    const dupe = await client.stockItem.findFirst({
      where: { tenantKey: TENANT_KEY, gtin, partId: { not: partId } },
      select: { id: true },
    });
    if (dupe) throw new DuplicateCodeError("gtin");
  }
  const warehouseId = await defaultWarehouseId(client);
  await client.stockItem.update({ where: { partId_warehouseId: { partId, warehouseId } }, data: { barcode, gtin } });
}

export const CELL_RE = /^[A-Z0-9-]{1,32}$/;

/** Expand a cell spec into codes: "A-1-1" → [A-1-1]; "A-1-1..A-3-4" → the
 *  cartesian product over the numeric segments that differ. Returns an error
 *  string for a malformed/oversized range. */
export function expandCellSpec(spec: string): string[] | { error: string } {
  const [a, b] = spec.split("..").map((s) => s.trim().toUpperCase());
  if (!a) return { error: "Укажите код или диапазон ячеек" };
  if (!b) return [a];
  const as = a.split("-");
  const bs = b.split("-");
  if (as.length !== bs.length) return { error: "Диапазон: коды должны иметь одинаковую структуру" };
  const dims: string[][] = [];
  for (let i = 0; i < as.length; i++) {
    if (as[i] === bs[i]) {
      dims.push([as[i]]);
    } else if (/^\d+$/.test(as[i]) && /^\d+$/.test(bs[i])) {
      const lo = Math.min(Number(as[i]), Number(bs[i]));
      const hi = Math.max(Number(as[i]), Number(bs[i]));
      if (hi - lo > 500) return { error: "Слишком большой диапазон" };
      const arr: string[] = [];
      for (let n = lo; n <= hi; n++) arr.push(String(n));
      dims.push(arr);
    } else {
      return { error: `Сегмент ${i + 1}: перебор возможен только по числам` };
    }
  }
  let acc: string[] = [""];
  for (const d of dims) {
    const next: string[] = [];
    for (const p of acc) for (const v of d) next.push(p ? `${p}-${v}` : v);
    acc = next;
    if (acc.length > 1000) return { error: "Слишком много ячеек (макс. 1000)" };
  }
  return acc;
}
