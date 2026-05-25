/**
 * Verifies the consumeStock availability floor (audit findings H1/M1):
 *  - consuming within on-hand decrements normally;
 *  - consuming MORE than on-hand throws a typed WmsError("INSUFFICIENT_STOCK")
 *    BEFORE any movement, so on-hand can never go negative through the code path;
 *  - the DB CHECK(quantity>=0) backstop constraint exists.
 * All stock writes run inside a transaction that is rolled back, so the script
 * leaves no fixture behind and never touches real stock.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { consumeStock } from "../lib/wms/public";
import { WmsError } from "../lib/wms/public/errors";

const TENANT = "geleoteka";
const WH = "wh_main_geleoteka"; // seeded default warehouse (migration 20260525013449)

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

class Rollback extends Error {}

async function main(): Promise<void> {
  console.log("[verify-wms-consume-floor] starting");

  // 1. DB backstop present.
  const checks = (await db.$queryRawUnsafe(
    `SELECT conname FROM pg_constraint WHERE conname = 'StockItem_quantity_nonneg'`,
  )) as Array<{ conname: string }>;
  assert(checks.length === 1, "StockItem_quantity_nonneg CHECK constraint missing");
  console.log("  ✓ DB CHECK(quantity>=0) present");

  const ts = Date.now();
  try {
    await db.$transaction(async (tx) => {
      const part = (await tx.part.create({
        data: { slug: `verify-floor-${ts}`, article: `VF-${ts}`, name: "Verify Floor", price: 1000 },
        select: { id: true },
      })) as { id: string };
      await tx.stockItem.create({
        data: { partId: part.id, warehouseId: WH, quantity: 5, tenantKey: TENANT },
      });

      // 2. Consume within on-hand → decrements 5 → 2.
      const r1 = await consumeStock(tx, {
        item: { itemId: part.id, warehouseId: WH },
        qty: 3,
        source: { type: "VerifyFloor", id: `${part.id}:ok` },
        tenantKey: TENANT,
      });
      assert(r1.applied && r1.quantity === 2, `consume 3 of 5 should leave 2 (got ${r1.quantity})`);
      console.log("  ✓ consume within on-hand decrements (5 → 2)");

      // 3. Consume MORE than the remaining 2 → typed INSUFFICIENT_STOCK, no movement.
      let code: string | undefined;
      try {
        await consumeStock(tx, {
          item: { itemId: part.id, warehouseId: WH },
          qty: 5,
          source: { type: "VerifyFloor", id: `${part.id}:over` },
          tenantKey: TENANT,
        });
      } catch (e) {
        code = e instanceof WmsError ? e.code : `unexpected:${(e as Error).message}`;
      }
      assert(code === "INSUFFICIENT_STOCK", `over-consume must throw INSUFFICIENT_STOCK (got ${code})`);
      console.log("  ✓ over-consume rejected with INSUFFICIENT_STOCK — on-hand stays >= 0");

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log("  ✓ all test writes rolled back — no fixture persisted");
  console.log("[verify-wms-consume-floor] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-wms-consume-floor] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
