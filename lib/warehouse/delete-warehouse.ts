import type { DbClientPort } from "@/lib/wms/public";

/**
 * Hard-delete a warehouse (physical site) and all its WMS rows. Mirrors the
 * empty-only cell-delete one level up, but per the product decision a warehouse
 * with movement HISTORY may still be deleted as long as it holds no current
 * stock — so this cascades the audit (StockMovement.warehouseId is non-nullable,
 * history cannot be detached, only destroyed).
 *
 * Guards (throw, rolling back the caller's tx):
 *  - WAREHOUSE_NOT_FOUND — no such warehouse in the tenant.
 *  - WAREHOUSE_IS_DEFAULT — the tenant default is never deletable (reassign first).
 *  - WAREHOUSE_HAS_STOCK — any StockItem.quantity > 0 or any StockBin.quantity > 0.
 *
 * Cascade order (children before the warehouse, since the warehouse FKs are
 * Restrict): bin audit → movements → bins → count lines → count sessions →
 * locations → stock rows → the warehouse. Pass a `$transaction` client so the
 * whole cascade commits or rolls back atomically.
 */
export async function deleteWarehouse(
  client: DbClientPort,
  id: string,
  tenantKey: string,
): Promise<void> {
  const wh = (await client.warehouse.findFirst({
    where: { id, tenantKey },
    select: { id: true, isDefault: true },
  })) as { id: string; isDefault: boolean } | null;
  if (!wh) throw new Error("WAREHOUSE_NOT_FOUND");
  if (wh.isDefault) throw new Error("WAREHOUSE_IS_DEFAULT");

  const stockedItem = (await client.stockItem.findFirst({
    where: { warehouseId: id, quantity: { gt: 0 } },
    select: { id: true },
  })) as { id: string } | null;
  if (stockedItem) throw new Error("WAREHOUSE_HAS_STOCK");
  const stockedBin = (await client.stockBin.findFirst({
    where: { warehouseId: id, quantity: { gt: 0 } },
    select: { id: true },
  })) as { id: string } | null;
  if (stockedBin) throw new Error("WAREHOUSE_HAS_STOCK");

  await client.stockBinMovement.deleteMany({ where: { item: { warehouseId: id } } });
  await client.stockMovement.deleteMany({ where: { warehouseId: id } });
  await client.stockBin.deleteMany({ where: { warehouseId: id } });
  await client.stockCountLine.deleteMany({ where: { session: { warehouseId: id } } });
  await client.stockCountSession.deleteMany({ where: { warehouseId: id } });
  await client.stockLocation.deleteMany({ where: { warehouseId: id } });
  await client.stockItem.deleteMany({ where: { warehouseId: id } });
  await client.warehouse.delete({ where: { id } });
}
