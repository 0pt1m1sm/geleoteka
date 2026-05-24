/**
 * Seeds a repair order for Phase-4 picking E2E (TS-001/002/003). Idempotent-ish:
 * deletes any prior E2E-PICK fixtures first. Prints the RO id + scannable codes.
 * NOT a verify script — leaves data in place for the browser run. Clean up with
 * `--clean`.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { placeStock } from "../lib/wms/public";
import { TENANT_KEY } from "../lib/wms-host";
const WH = "wh_main_geleoteka";

async function clean(): Promise<void> {
  await db.vehicle.deleteMany({ where: { vin: { startsWith: "E2E-PICK-" } } });
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-pick-" } } });
  await db.part.deleteMany({ where: { article: { startsWith: "E2E-PICK-" } } });
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "E2E-PICK-" } } });
}

async function makePart(article: string, qty: number): Promise<string> {
  const p = (await db.part.create({
    data: {
      slug: article.toLowerCase(),
      article,
      name: `E2E pick ${article}`,
      price: 1000,
      stockItems: { create: { warehouseId: WH, quantity: qty, tenantKey: TENANT_KEY } },
    },
    select: { id: true },
  })) as { id: string };
  return p.id;
}

async function main(): Promise<void> {
  await clean();
  if (process.argv.includes("--clean")) {
    console.log("[seed-picking-e2e] cleaned");
    await db.$disconnect();
    return;
  }

  // PA: on the order (line 1, qty 2), 5 placed in E2E-A1 → TS-001 happy pick.
  const pa = await makePart("E2E-PICK-A", 5);
  await placeStock(db, { itemId: pa, warehouseId: WH, location: "E2E-A1", qty: 5, tenantKey: TENANT_KEY });
  // PC: on the order (line 2, qty 5) but only 2 placed in E2E-C1 → TS-003 short bin.
  const pc = await makePart("E2E-PICK-C", 2);
  await placeStock(db, { itemId: pc, warehouseId: WH, location: "E2E-C1", qty: 2, tenantKey: TENANT_KEY });
  // PB: NOT on the order → TS-002 WRONG_ITEM when scanned against a line.
  await makePart("E2E-PICK-B", 5);

  const user = (await db.user.create({
    data: { email: "e2e-pick-customer@test.local", phone: "+79001112233", name: "E2E Pick Customer" },
    select: { id: true },
  })) as { id: string };
  const deal = (await db.deal.create({
    data: { customerUserId: user.id, channel: "SERVICE" },
    select: { id: true },
  })) as { id: string };
  await db.estimate.create({
    data: {
      dealId: deal.id,
      stage: "APPROVED",
      approvedAt: new Date(),
      estimateLines: {
        create: [
          { type: "PART", description: "E2E line A", qty: 2, partId: pa, sortOrder: 0 },
          { type: "PART", description: "E2E line C", qty: 5, partId: pc, sortOrder: 1 },
        ],
      },
    },
  });
  const vehicle = (await db.vehicle.create({
    data: { ownerUserId: user.id, vin: "E2E-PICK-VIN1", model: "G 500", year: 2024 },
    select: { id: true },
  })) as { id: string };
  const ro = (await db.repairOrder.create({
    data: {
      userId: user.id,
      vehicleId: vehicle.id,
      dealId: deal.id,
      dateTime: new Date(),
      status: "IN_PROGRESS",
      roNumber: "E2E-PICK-RO",
    },
    select: { id: true },
  })) as { id: string };

  console.log("[seed-picking-e2e] READY");
  console.log("repairOrderId:", ro.id);
  console.log("pick URL:      /admin/warehouse/picking/" + ro.id);
  console.log("line A part:   E2E-PICK-A  (qty 2)  bin E2E-A1 (has 5)  → happy");
  console.log("line C part:   E2E-PICK-C  (qty 5)  bin E2E-C1 (has 2)  → INSUFFICIENT_BIN");
  console.log("off-order:     E2E-PICK-B  → WRONG_ITEM when scanned on a line");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
