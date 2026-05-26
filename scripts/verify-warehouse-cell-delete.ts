/**
 * Verifies deleteLocation (warehouse-layout): an empty cell is deleted (registry
 * row + leftover zero-qty bins gone); a cell that still holds stock is rejected
 * (LOCATION_NOT_EMPTY); an unknown cell throws LOCATION_NOT_FOUND. Rolled-back
 * tx — no fixtures persist.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { deleteLocation } from "../lib/wms/public/locations";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
const TENANT = "geleoteka";
const WH = "wh_main_geleoteka";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}
class Rollback extends Error {}

async function main(): Promise<void> {
  console.log("[verify-warehouse-cell-delete] starting");
  const ts = Date.now();
  const empty = `EMPTY${ts}`;
  const full = `FULL${ts}`;
  const ghost = `GHOST${ts}`;

  try {
    await db.$transaction(async (tx: Tx) => {
      const part = (await tx.part.create({
        data: { slug: `dl-${ts}`, article: `DL-${ts}`, name: "Delete Verify", price: 1 },
        select: { id: true },
      })) as { id: string };
      const si = (await tx.stockItem.create({
        data: { partId: part.id, warehouseId: WH, quantity: 5, tenantKey: TENANT },
        select: { id: true },
      })) as { id: string };
      const mkLoc = (code: string) =>
        (tx as Tx).stockLocation.create({ data: { code, warehouseId: WH, tenantKey: TENANT, isActive: true, isBlocked: false } });
      await mkLoc(empty);
      await mkLoc(full);
      // empty cell carries a leftover zero-qty bin; full cell holds 5
      await tx.stockBin.create({ data: { itemId: si.id, location: empty, quantity: 0, warehouseId: WH, tenantKey: TENANT } });
      await tx.stockBin.create({ data: { itemId: si.id, location: full, quantity: 5, warehouseId: WH, tenantKey: TENANT } });

      await deleteLocation(tx, empty, WH, TENANT);
      const goneLoc = await tx.stockLocation.findFirst({ where: { tenantKey: TENANT, warehouseId: WH, code: empty }, select: { code: true } });
      const goneBins = await tx.stockBin.count({ where: { tenantKey: TENANT, warehouseId: WH, location: empty } });
      assert(!goneLoc, "empty cell registry row should be deleted");
      assert(goneBins === 0, `empty cell leftover bins should be deleted (got ${goneBins})`);
      console.log("  ✓ empty cell deleted (registry row + zero-qty bins gone)");

      let code: string | undefined;
      try {
        await deleteLocation(tx, full, WH, TENANT);
      } catch (e) {
        code = (e as Error).message;
      }
      assert(code === "LOCATION_NOT_EMPTY", `deleting a cell with stock must throw LOCATION_NOT_EMPTY (got ${code})`);
      const stillThere = await tx.stockLocation.findFirst({ where: { tenantKey: TENANT, warehouseId: WH, code: full }, select: { code: true } });
      assert(stillThere, "a cell with stock must NOT be deleted");
      console.log("  ✓ cell with stock rejected (LOCATION_NOT_EMPTY) and preserved");

      let code2: string | undefined;
      try {
        await deleteLocation(tx, ghost, WH, TENANT);
      } catch (e) {
        code2 = (e as Error).message;
      }
      assert(code2 === "LOCATION_NOT_FOUND", `deleting an unknown cell must throw LOCATION_NOT_FOUND (got ${code2})`);
      console.log("  ✓ unknown cell rejected (LOCATION_NOT_FOUND)");

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log("  ✓ rolled back — nothing persisted");
  console.log("[verify-warehouse-cell-delete] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-warehouse-cell-delete] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
