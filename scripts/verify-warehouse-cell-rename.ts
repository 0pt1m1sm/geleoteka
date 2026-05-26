/**
 * Verifies renameLocation (warehouse-layout Phase 2): renaming a cell moves both
 * its StockLocation registry code AND all its bins, atomically; and renaming to
 * an existing code is rejected (LOCATION_EXISTS). Rolled-back tx — no fixtures.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { renameLocation } from "../lib/wms/public/locations";

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
  console.log("[verify-warehouse-cell-rename] starting");
  const ts = Date.now();
  const from = `TMPCELL${ts}`;
  const to = `NEWCELL${ts}`;
  const other = `OTHERCELL${ts}`;

  try {
    await db.$transaction(async (tx: Tx) => {
      const part = (await tx.part.create({
        data: { slug: `rl-${ts}`, article: `RL-${ts}`, name: "Rename Verify", price: 1 },
        select: { id: true },
      })) as { id: string };
      const si = (await tx.stockItem.create({
        data: { partId: part.id, warehouseId: WH, quantity: 5, tenantKey: TENANT },
        select: { id: true },
      })) as { id: string };
      const mkLoc = (code: string) =>
        (tx as Tx).stockLocation.create({ data: { code, warehouseId: WH, tenantKey: TENANT, isActive: true, isBlocked: false } });
      await mkLoc(from);
      await mkLoc(other);
      await tx.stockBin.create({ data: { itemId: si.id, location: from, quantity: 5, warehouseId: WH, tenantKey: TENANT } });

      await renameLocation(tx, from, to, WH, TENANT);
      const newLoc = await tx.stockLocation.findFirst({ where: { tenantKey: TENANT, warehouseId: WH, code: to }, select: { code: true } });
      const oldLoc = await tx.stockLocation.findFirst({ where: { tenantKey: TENANT, warehouseId: WH, code: from }, select: { code: true } });
      const bin = (await tx.stockBin.findFirst({ where: { tenantKey: TENANT, warehouseId: WH, itemId: si.id }, select: { location: true } })) as { location: string } | null;
      assert(newLoc && !oldLoc, "registry code should move from→to");
      assert(bin?.location === to, `bin should move to the new code (got ${bin?.location})`);
      console.log("  ✓ rename moves the registry code AND the bins");

      let code: string | undefined;
      try {
        await renameLocation(tx, to, other, WH, TENANT); // target already exists
      } catch (e) {
        code = (e as Error).message;
      }
      assert(code === "LOCATION_EXISTS", `rename to an existing cell must throw LOCATION_EXISTS (got ${code})`);
      console.log("  ✓ rename to an existing code rejected (LOCATION_EXISTS)");

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log("  ✓ rolled back — nothing persisted");
  console.log("[verify-warehouse-cell-rename] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-warehouse-cell-rename] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
