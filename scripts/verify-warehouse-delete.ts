/**
 * Verifies deleteWarehouse (warehouse site hard-delete):
 *  - a warehouse with movement HISTORY but ZERO current stock is deleted, and
 *    its WMS rows (items, movements, bins, bin audit, locations) cascade away;
 *  - a warehouse still holding stock is rejected (WAREHOUSE_HAS_STOCK);
 *  - the tenant default is rejected (WAREHOUSE_IS_DEFAULT);
 *  - an unknown id throws WAREHOUSE_NOT_FOUND.
 * Rolled-back tx — no fixtures persist.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { recordMovement, placeStock, consumeStock } from "../lib/wms/public";
import { deleteWarehouse } from "../lib/warehouse/delete-warehouse";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
const TENANT = "geleoteka";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}
class Rollback extends Error {}

async function main(): Promise<void> {
  console.log("[verify-warehouse-delete] starting");
  const ts = Date.now();

  try {
    await db.$transaction(async (tx: Tx) => {
      // A throwaway non-default warehouse + a part with stock that we then fully
      // consume → leaves movement HISTORY (RECEIPT + CONSUMPTION) but zero on-hand.
      const wh = (await tx.warehouse.create({
        data: { code: `DELWH${ts}`, name: "delete-verify wh", tenantKey: TENANT, isActive: true, isDefault: false },
        select: { id: true },
      })) as { id: string };
      const part = (await tx.part.create({
        data: { slug: `dw-${ts}`, article: `DW-${ts}`, name: "DW part", price: 1 },
        select: { id: true },
      })) as { id: string };
      await tx.stockLocation.create({ data: { code: "DW-1-1", warehouseId: wh.id, tenantKey: TENANT, isActive: true, isBlocked: false } });

      // receive 4 → place 4 → consume 4 from that bin: history present, stock 0.
      await recordMovement(tx, { item: { itemId: part.id, warehouseId: wh.id }, reason: "RECEIPT", qty: 4, source: { type: "DWVerify", id: "r1" }, tenantKey: TENANT });
      await placeStock(tx, { itemId: part.id, warehouseId: wh.id, location: "DW-1-1", qty: 4, tenantKey: TENANT });
      await consumeStock(tx, { item: { itemId: part.id, warehouseId: wh.id }, qty: 4, fromLocation: "DW-1-1", source: { type: "DWVerify", id: "c1" }, tenantKey: TENANT });

      const histBefore = await tx.stockMovement.count({ where: { warehouseId: wh.id } });
      assert(histBefore >= 2, `precondition: movement history present (got ${histBefore})`);
      const onHand = (await tx.stockItem.findFirst({ where: { warehouseId: wh.id }, select: { quantity: true } })) as { quantity: number };
      assert(onHand.quantity === 0, `precondition: zero current stock (got ${onHand.quantity})`);
      console.log("  ✓ precondition: history present, zero current stock");

      // CORE: delete succeeds and cascades all WMS rows.
      await deleteWarehouse(tx, wh.id, TENANT);
      assert(!(await tx.warehouse.findUnique({ where: { id: wh.id }, select: { id: true } })), "warehouse row deleted");
      assert((await tx.stockMovement.count({ where: { warehouseId: wh.id } })) === 0, "movement history cascaded");
      assert((await tx.stockItem.count({ where: { warehouseId: wh.id } })) === 0, "stock rows cascaded");
      assert((await tx.stockBin.count({ where: { warehouseId: wh.id } })) === 0, "bins cascaded");
      assert((await tx.stockBinMovement.count({ where: { item: { warehouseId: wh.id } } })) === 0, "bin audit cascaded");
      assert((await tx.stockLocation.count({ where: { warehouseId: wh.id } })) === 0, "locations cascaded");
      console.log("  ✓ deletes warehouse with history+zero stock, cascading all WMS rows");

      // A warehouse still holding stock is rejected.
      const wh2 = (await tx.warehouse.create({
        data: { code: `DELWH2${ts}`, name: "delete-verify wh2", tenantKey: TENANT, isActive: true, isDefault: false },
        select: { id: true },
      })) as { id: string };
      await recordMovement(tx, { item: { itemId: part.id, warehouseId: wh2.id }, reason: "RECEIPT", qty: 3, source: { type: "DWVerify", id: "r2" }, tenantKey: TENANT });
      let stockCode: string | undefined;
      try {
        await deleteWarehouse(tx, wh2.id, TENANT);
      } catch (e) {
        stockCode = (e as Error).message;
      }
      assert(stockCode === "WAREHOUSE_HAS_STOCK", `warehouse with stock must throw WAREHOUSE_HAS_STOCK (got ${stockCode})`);
      assert(await tx.warehouse.findUnique({ where: { id: wh2.id }, select: { id: true } }), "stocked warehouse preserved");
      console.log("  ✓ warehouse with current stock rejected (WAREHOUSE_HAS_STOCK)");

      // The default warehouse is rejected.
      const def = (await tx.warehouse.findFirst({ where: { tenantKey: TENANT, isDefault: true }, select: { id: true } })) as { id: string } | null;
      assert(def, "tenant has a default warehouse");
      let defCode: string | undefined;
      try {
        await deleteWarehouse(tx, def.id, TENANT);
      } catch (e) {
        defCode = (e as Error).message;
      }
      assert(defCode === "WAREHOUSE_IS_DEFAULT", `default warehouse must throw WAREHOUSE_IS_DEFAULT (got ${defCode})`);
      console.log("  ✓ default warehouse rejected (WAREHOUSE_IS_DEFAULT)");

      // Unknown id.
      let nfCode: string | undefined;
      try {
        await deleteWarehouse(tx, `nope-${ts}`, TENANT);
      } catch (e) {
        nfCode = (e as Error).message;
      }
      assert(nfCode === "WAREHOUSE_NOT_FOUND", `unknown id must throw WAREHOUSE_NOT_FOUND (got ${nfCode})`);
      console.log("  ✓ unknown warehouse rejected (WAREHOUSE_NOT_FOUND)");

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log("  ✓ rolled back — nothing persisted");
  console.log("[verify-warehouse-delete] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-warehouse-delete] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
