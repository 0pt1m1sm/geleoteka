/**
 * Seeds customer part-orders for Phase-4b packing E2E (TS-001/002/003/005).
 * Deletes any prior E2E-PACK fixtures first, then creates:
 *   - a CRM PartShipment (PROCESSING, APPROVED estimate, 2 PART lines, NO items)
 *     with both parts placed in bins → TS-001 happy pack + ship
 *   - an off-order part → TS-002 WRONG_ITEM
 *   - a retail PartShipment (PROCESSING, PartOrderItem rows, consumed at sale)
 *     → TS-003 ships with nothing to pack
 *   - relies on an existing SHIPPED order OR leaves the retail one to flip → TS-005
 * NOT a verify script — leaves data in place for the browser run. Clean: `--clean`.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { placeStock, consumeStock } from "../lib/wms/public";
import { TENANT_KEY } from "../lib/wms-host";
import { nextPartOrderNumber } from "../lib/crm/public";

async function clean(): Promise<void> {
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-pack-" } } });
  await db.part.deleteMany({ where: { article: { startsWith: "E2E-PACK-" } } });
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "E2E-PACK-" } } });
}

async function makePart(article: string, qty: number): Promise<string> {
  const p = (await db.part.create({
    data: {
      slug: article.toLowerCase(),
      article,
      name: `E2E pack ${article}`,
      price: 1000,
      stockItem: { create: { quantity: qty, tenantKey: TENANT_KEY } },
    },
    select: { id: true },
  })) as { id: string };
  return p.id;
}

async function main(): Promise<void> {
  await clean();
  if (process.argv.includes("--clean")) {
    console.log("[seed-packing-e2e] cleaned");
    await db.$disconnect();
    return;
  }

  // CRM order parts: placed in bins so they can be packed bin-aware.
  const pa = await makePart("E2E-PACK-A", 5);
  await placeStock(db, { itemId: pa, location: "E2E-PA1", qty: 5, tenantKey: TENANT_KEY });
  const pb = await makePart("E2E-PACK-B", 5);
  await placeStock(db, { itemId: pb, location: "E2E-PB1", qty: 5, tenantKey: TENANT_KEY });
  // Off-order part → WRONG_ITEM when scanned on a CRM line.
  await makePart("E2E-PACK-OFF", 5);

  // ── CRM PartShipment (no items, APPROVED estimate) ──
  const crmUser = (await db.user.create({
    data: { email: "e2e-pack-crm@test.local", phone: "+79002223344", name: "E2E Pack CRM" },
    select: { id: true },
  })) as { id: string };
  const crmDeal = (await db.deal.create({
    data: { customerUserId: crmUser.id, channel: "PARTS_WHOLESALE" },
    select: { id: true },
  })) as { id: string };
  await db.estimate.create({
    data: {
      dealId: crmDeal.id,
      stage: "APPROVED",
      approvedAt: new Date(),
      estimateLines: {
        create: [
          { type: "PART", description: "E2E pack line A", qty: 2, partId: pa, sortOrder: 0 },
          { type: "PART", description: "E2E pack line B", qty: 3, partId: pb, sortOrder: 1 },
        ],
      },
    },
  });
  const crmNumber = await nextPartOrderNumber(db);
  const crmOrder = (await db.partShipment.create({
    data: {
      orderNumber: crmNumber,
      userId: crmUser.id,
      dealId: crmDeal.id,
      status: "PROCESSING",
      total: 5000,
      contactName: "E2E Pack CRM",
      contactPhone: "+79002223344",
      contactEmail: "e2e-pack-crm@test.local",
    },
    select: { id: true },
  })) as { id: string };

  // ── Retail PartShipment (items, consumed at sale) ──
  const pr = await makePart("E2E-PACK-R", 10);
  await placeStock(db, { itemId: pr, location: "E2E-PR1", qty: 10, tenantKey: TENANT_KEY });
  const retUser = (await db.user.create({
    data: { email: "e2e-pack-retail@test.local", phone: "+79003334455", name: "E2E Pack Retail" },
    select: { id: true },
  })) as { id: string };
  const retDeal = (await db.deal.create({
    data: { customerUserId: retUser.id, channel: "PARTS_RETAIL" },
    select: { id: true },
  })) as { id: string };
  const retNumber = await nextPartOrderNumber(db);
  const retOrder = (await db.partShipment.create({
    data: {
      orderNumber: retNumber,
      userId: retUser.id,
      dealId: retDeal.id,
      status: "PROCESSING",
      total: 1000,
      contactName: "E2E Pack Retail",
      contactPhone: "+79003334455",
      contactEmail: "e2e-pack-retail@test.local",
      items: { create: [{ partId: pr, quantity: 1, unitPrice: 1000 }] },
    },
    select: { id: true },
  })) as { id: string };
  // Point-of-sale consumption (source orderId:partId), so the retail order reads
  // as already fulfilled → shippable with nothing to pack.
  await consumeStock(db, {
    item: { itemId: pr },
    qty: 1,
    source: { type: "PartShipment", id: `${retOrder.id}:${pr}` },
    tenantKey: TENANT_KEY,
  });

  console.log("[seed-packing-e2e] READY");
  console.log("CRM order:    ", crmNumber, "→ /admin/warehouse/packing/" + crmOrder.id);
  console.log("  line A:      E2E-PACK-A  qty 2  bin E2E-PA1 (has 5)  → happy pack");
  console.log("  line B:      E2E-PACK-B  qty 3  bin E2E-PB1 (has 5)  → happy pack");
  console.log("  off-order:   E2E-PACK-OFF  → WRONG_ITEM when scanned on a line");
  console.log("Retail order: ", retNumber, "→ /admin/warehouse/packing/" + retOrder.id, "(already consumed at sale)");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
