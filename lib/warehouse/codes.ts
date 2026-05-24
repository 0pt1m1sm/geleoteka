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
