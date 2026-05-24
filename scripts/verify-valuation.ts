/**
 * Verifies WMS Phase 6 valuation domain against the dev DB.
 *
 *  - latestUnitCostByPartIds: latest SupplierOrderItem.unitCost per part (by order date)
 *  - buildValuationReport: onHand × latest cost; total over known-cost lines;
 *    noCostCount for in-stock parts with no purchase history
 *
 * Fixtures use the VERIFY-VAL- prefix for cleanup.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { TENANT_KEY } from "../lib/wms-host";
import { latestUnitCostByPartIds, buildValuationReport } from "../lib/warehouse/valuation";

const WH = "wh_main_geleoteka"; // seeded default warehouse (Phase 6)

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const PREFIX = "VERIFY-VAL-";

async function makePart(tag: string, quantity: number): Promise<string> {
  const article = `${PREFIX}${tag}`;
  const part = (await db.part.create({
    data: { slug: article.toLowerCase(), article, name: `${PREFIX}${tag}`, price: 999, isActive: true },
    select: { id: true },
  })) as { id: string };
  await db.stockItem.create({ data: { partId: part.id, tenantKey: TENANT_KEY, warehouseId: WH, quantity, reserved: 0 } });
  return part.id;
}

async function cleanup(): Promise<void> {
  const orders = (await db.supplierOrder.findMany({
    where: { orderNumber: { startsWith: PREFIX } },
    select: { id: true },
  })) as Array<{ id: string }>;
  for (const o of orders) await db.supplierOrder.delete({ where: { id: o.id } });
  await db.part.deleteMany({ where: { article: { startsWith: PREFIX } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX.toLowerCase() } } });
}

async function main(): Promise<void> {
  await cleanup();

  const supplier = (await db.user.create({
    data: {
      email: `${PREFIX.toLowerCase()}supplier@test`,
      phone: `${PREFIX}${Date.now()}`,
      name: `${PREFIX}supplier`,
      isSupplier: true,
    },
    select: { id: true },
  })) as { id: string };

  const p1 = await makePart("P1-hist", 10); // two orders → latest cost 150
  const p2 = await makePart("P2-nocost", 5); // no order, on-hand 5
  const p3 = await makePart("P3-zero", 0); // no order, on-hand 0 (not counted in noCost)

  // Older order: unitCost 100; newer order: unitCost 150 → latest wins.
  await db.supplierOrder.create({
    data: {
      userId: supplier.id,
      orderNumber: `${PREFIX}PO-old`,
      orderDate: new Date("2026-01-01"),
      status: "ORDERED",
      items: { create: [{ type: "PART", partId: p1, description: `${PREFIX}p1`, quantity: 1, unitCost: 100, totalCost: 100 }] },
    },
  });
  await db.supplierOrder.create({
    data: {
      userId: supplier.id,
      orderNumber: `${PREFIX}PO-new`,
      orderDate: new Date("2026-02-01"),
      status: "ORDERED",
      items: { create: [{ type: "PART", partId: p1, description: `${PREFIX}p1`, quantity: 1, unitCost: 150, totalCost: 150 }] },
    },
  });

  const costMap = await latestUnitCostByPartIds(db, [p1, p2, p3]);
  assert(costMap.get(p1) === 150, `latest unitCost for P1 = 150 (got ${costMap.get(p1)})`);
  assert(!costMap.has(p2), "P2 (no purchase) absent from cost map");
  assert(!costMap.has(p3), "P3 (no purchase) absent from cost map");

  const report = await buildValuationReport(db, TENANT_KEY, WH);
  const byId = new Map(report.rows.map((r) => [r.partId, r]));

  const r1 = byId.get(p1);
  assert(r1, "P1 in valuation rows");
  assert(r1!.onHand === 10 && r1!.unitCost === 150 && r1!.lineValue === 1500, `P1 line value 10×150=1500 (got ${r1?.lineValue})`);

  const r2 = byId.get(p2);
  assert(r2 && r2.unitCost === null && r2.lineValue === null, "P2 has null cost / null line value");

  // Total must include P1's 1500 and exclude null-cost lines.
  assert(report.totalValue >= 1500, `total includes P1 1500 (got ${report.totalValue})`);
  // noCostCount counts in-stock-no-cost parts (P2, onHand 5) but not P3 (onHand 0).
  const r3 = byId.get(p3);
  assert(r3 && r3.unitCost === null, "P3 present with null cost");
  assert(report.noCostCount >= 1, "noCostCount counts at least P2");

  await cleanup();
  console.log("PASS: valuation domain (latest-cost + report total + noCostCount)");
  process.exit(0);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
