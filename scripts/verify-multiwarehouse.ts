/**
 * Verifies WMS Phase 6 multi-warehouse core (Task 6) against the dev DB.
 *
 *  - A part holds independent stock in two warehouses (per-(part,warehouse) row).
 *  - recordMovement updates only the targeted warehouse's row.
 *  - The SAME business source received into a DIFFERENT warehouse APPLIES (not a
 *    silent idempotent no-op) — the idempotency unique now includes warehouseId.
 *  - Consuming from one warehouse does not touch the other.
 *  - A location code blocked in one warehouse stays usable in the other.
 *
 * Fixtures use the VERIFY-MW- prefix; a throwaway 2nd warehouse is created + dropped.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { TENANT_KEY } from "../lib/wms-host";
import { recordMovement, consumeStock, getLocation, setLocationBlocked, assertLocationUsable, WmsError } from "../lib/wms/public";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const PREFIX = "VERIFY-MW-";
const MAIN = "wh_main_geleoteka";
const WH2 = "wh-mw2-test";

async function onHand(partId: string, warehouseId: string): Promise<number> {
  const si = (await db.stockItem.findUnique({
    where: { partId_warehouseId: { partId, warehouseId } },
    select: { quantity: true },
  })) as { quantity: number } | null;
  return si?.quantity ?? 0;
}

async function cleanup(): Promise<void> {
  await db.part.deleteMany({ where: { article: { startsWith: PREFIX } } });
  await db.stockLocation.deleteMany({ where: { warehouseId: WH2 } });
  await db.warehouse.deleteMany({ where: { id: WH2 } });
}

async function main(): Promise<void> {
  await cleanup();

  await db.warehouse.create({
    data: { id: WH2, code: "MW2", name: `${PREFIX}second`, tenantKey: TENANT_KEY, isDefault: false },
  });

  const part = (await db.part.create({
    data: { slug: `${PREFIX.toLowerCase()}p1`, article: `${PREFIX}P1`, name: `${PREFIX}P1`, price: 0, isActive: true },
    select: { id: true },
  })) as { id: string };
  const p = part.id;

  // RECEIPT 5 into MAIN and 3 into WH2 — SAME source id in both warehouses.
  const SRC = { type: "VerifyMW", id: `${PREFIX}recv` };
  const mvMain = await recordMovement(db, { item: { itemId: p, warehouseId: MAIN }, reason: "RECEIPT", qty: 5, source: SRC, tenantKey: TENANT_KEY });
  const mvWh2 = await recordMovement(db, { item: { itemId: p, warehouseId: WH2 }, reason: "RECEIPT", qty: 3, source: SRC, tenantKey: TENANT_KEY });
  assert(mvMain.applied && mvWh2.applied, "both warehouse receipts APPLIED (same source, different warehouse — no cross-warehouse collision)");
  assert((await onHand(p, MAIN)) === 5, `MAIN on-hand 5 (got ${await onHand(p, MAIN)})`);
  assert((await onHand(p, WH2)) === 3, `WH2 on-hand 3 (got ${await onHand(p, WH2)})`);

  // Two distinct StockItem rows for the one part.
  const rows = (await db.stockItem.findMany({ where: { partId: p }, select: { warehouseId: true, quantity: true } })) as Array<{ warehouseId: string; quantity: number }>;
  assert(rows.length === 2, `part has 2 stock rows (got ${rows.length})`);

  // Replay the SAME source into MAIN → idempotent no-op (within the same warehouse).
  const replay = await recordMovement(db, { item: { itemId: p, warehouseId: MAIN }, reason: "RECEIPT", qty: 5, source: SRC, tenantKey: TENANT_KEY });
  assert(!replay.applied && (await onHand(p, MAIN)) === 5, "same source replay in the SAME warehouse is a no-op");

  // Consume 2 from MAIN — WH2 untouched.
  await consumeStock(db, { item: { itemId: p, warehouseId: MAIN }, qty: 2, source: { type: "VerifyMW", id: `${PREFIX}consume` }, tenantKey: TENANT_KEY });
  assert((await onHand(p, MAIN)) === 3 && (await onHand(p, WH2)) === 3, "consume from MAIN leaves WH2 unchanged");

  // Location isolation: block cell MW-CELL in WH2; it stays usable in MAIN.
  await setLocationBlocked(db, "MW-CELL", WH2, TENANT_KEY, { isBlocked: true });
  const inWh2 = await getLocation(db, "MW-CELL", WH2, TENANT_KEY);
  assert(inWh2?.isBlocked === true, "MW-CELL is blocked in WH2");
  // In MAIN the same code is never-seen → assertLocationUsable auto-creates + passes.
  let mainBlocked = false;
  try {
    await assertLocationUsable(db, "MW-CELL", MAIN, TENANT_KEY);
  } catch (e) {
    mainBlocked = e instanceof WmsError && e.code === "LOCATION_BLOCKED";
  }
  assert(!mainBlocked, "MW-CELL blocked in WH2 does NOT block the same code in MAIN");

  await cleanup();
  console.log("PASS: multi-warehouse core (independent stock, cross-warehouse source applies, consume isolation, location isolation)");
  process.exit(0);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
