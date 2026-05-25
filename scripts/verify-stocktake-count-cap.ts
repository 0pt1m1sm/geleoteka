/**
 * Verifies the counted-quantity upper bound (prod crash fix): recordCount rejects
 * a value above 1,000,000 (which would overflow Postgres Int on post) with a
 * WmsError, while a normal value is accepted. Rolled-back tx — nothing persists.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { createCountSession, recordCount } from "../lib/wms/public/stocktake";
import { WmsError } from "../lib/wms/public/errors";

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
  console.log("[verify-stocktake-count-cap] starting");
  const part = (await db.part.findFirst({ select: { id: true } })) as { id: string } | null;
  assert(part, "no part in dev to count against");
  const cell = `CAP${Date.now()}-1-1`;
  try {
    await db.$transaction(async (tx: Tx) => {
      const s = (await createCountSession(tx, {
        scope: "LOCATION",
        warehouseId: WH,
        scopeValue: cell,
        locations: [cell],
        tenantKey: TENANT,
      })) as { id: string };

      // Over the 1M cap → rejected with a WmsError (no Int-overflow on post).
      let code: string | undefined;
      try {
        await recordCount(tx, { sessionId: s.id, itemId: part.id, location: cell, countedQty: 2_000_000, tenantKey: TENANT });
      } catch (e) {
        code = e instanceof WmsError ? e.code : `unexpected:${(e as Error).message}`;
      }
      assert(code === "INVALID_QTY", `over-cap count must throw INVALID_QTY (got ${code})`);
      console.log("  ✓ count > 1,000,000 rejected with INVALID_QTY (no Int overflow)");

      // A normal value is accepted.
      await recordCount(tx, { sessionId: s.id, itemId: part.id, location: cell, countedQty: 5, tenantKey: TENANT });
      console.log("  ✓ normal count (5) accepted");

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log("  ✓ rolled back — nothing persisted");
  console.log("[verify-stocktake-count-cap] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-stocktake-count-cap] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
