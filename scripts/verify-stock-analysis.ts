/**
 * Verifies WMS Phase 6 dead-stock + ABC analysis against the dev DB.
 *
 *  - deadStock(windowDays): in-stock parts with no CONSUMPTION in the window
 *  - abcAnalysis(windowDays): parts classified A/B/C by cumulative consumed-qty share
 *
 * Seeds StockMovement rows directly with explicit createdAt (we test the read-side
 * analysis, not recordMovement). Fixtures use the VERIFY-SA- prefix for cleanup.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { TENANT_KEY } from "../lib/wms-host";
import { deadStock, abcAnalysis } from "../lib/warehouse/stock-analysis";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const PREFIX = "VERIFY-SA-";
const DAY = 86400000;
const WH = "wh_main_geleoteka";

async function makePart(tag: string, quantity: number): Promise<{ partId: string; itemId: string }> {
  const article = `${PREFIX}${tag}`;
  const part = (await db.part.create({
    data: { slug: article.toLowerCase(), article, name: `${PREFIX}${tag}`, price: 0, isActive: true },
    select: { id: true },
  })) as { id: string };
  const si = (await db.stockItem.create({
    data: { partId: part.id, tenantKey: TENANT_KEY, warehouseId: WH, quantity, reserved: 0 },
    select: { id: true },
  })) as { id: string };
  return { partId: part.id, itemId: si.id };
}

async function consume(itemId: string, qty: number, daysAgo: number, tag: string): Promise<void> {
  await db.stockMovement.create({
    data: {
      itemId,
      reason: "CONSUMPTION",
      quantityDelta: -qty,
      reservedDelta: 0,
      sourceType: "VerifySA",
      sourceId: `${PREFIX}${tag}`,
      tenantKey: TENANT_KEY,
      warehouseId: WH,
      createdAt: new Date(Date.now() - daysAgo * DAY),
    },
  });
}

async function cleanup(): Promise<void> {
  await db.part.deleteMany({ where: { article: { startsWith: PREFIX } } });
}

async function main(): Promise<void> {
  await cleanup();

  const a = await makePart("A-big", 10);
  const e = await makePart("E-mid", 10);
  const f = await makePart("F-small", 10);
  const dead = await makePart("DEAD-old", 5);
  const never = await makePart("NEVER", 8);

  // In-window consumption (last 90d): A=70, E=20, F=10 → cum 70/90/100% → A/B/C.
  await consume(a.itemId, 70, 10, "A");
  await consume(e.itemId, 20, 5, "E");
  await consume(f.itemId, 10, 3, "F");
  // Old consumption (200d ago) → dead-stock with a lastConsumedAt, NOT in ABC window.
  await consume(dead.itemId, 3, 200, "DEAD");
  // 'never' has no consumption at all.

  // ---- dead-stock (90-day window) ----
  const dead90 = await deadStock(db, TENANT_KEY, WH, 90);
  const deadIds = new Set(dead90.map((r) => r.partId));
  assert(deadIds.has(dead.partId), "DEAD (consumed 200d ago) is dead-stock");
  assert(deadIds.has(never.partId), "NEVER (no consumption) is dead-stock");
  assert(!deadIds.has(a.partId) && !deadIds.has(e.partId) && !deadIds.has(f.partId), "recently-consumed parts are NOT dead-stock");
  const deadRow = dead90.find((r) => r.partId === dead.partId)!;
  assert(deadRow.lastConsumedAt instanceof Date, "DEAD row carries lastConsumedAt");
  const neverRow = dead90.find((r) => r.partId === never.partId)!;
  assert(neverRow.lastConsumedAt === null, "NEVER row has null lastConsumedAt");

  // ---- ABC (90-day window) ----
  const abc = await abcAnalysis(db, TENANT_KEY, WH, 90);
  const cls = new Map(abc.map((r) => [r.partId, r.abcClass]));
  assert(cls.get(a.partId) === "A", `A part is class A (got ${cls.get(a.partId)})`);
  assert(cls.get(e.partId) === "B", `E part is class B (got ${cls.get(e.partId)})`);
  assert(cls.get(f.partId) === "C", `F part is class C (got ${cls.get(f.partId)})`);
  assert(!cls.has(dead.partId), "DEAD (outside window) not in ABC");
  assert(!cls.has(never.partId), "NEVER (no consumption) not in ABC");

  await cleanup();
  console.log("PASS: stock-analysis (dead-stock window + ABC A/B/C by consumed qty)");
  process.exit(0);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
