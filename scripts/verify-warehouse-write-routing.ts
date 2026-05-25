/**
 * Verifies WMS Phase 6 fast-follow: per-warehouse WRITE routing.
 *
 * Every stock-changing host-lib op accepts an explicit `warehouseId` and writes
 * to THAT warehouse, leaving the default (MAIN) untouched. With no warehouseId
 * the op resolves the default (backward compatibility — covered by the other
 * verify-*.ts scripts). Here every op is invoked with a throwaway 2nd warehouse
 * (WH2) and we assert the write landed in WH2 and MAIN is unchanged.
 *
 *   - applyAdjustment(..., warehouseId)            → ADJUSTMENT lands in WH2
 *   - applyBlindReceive({ ..., warehouseId })      → RECEIPT lands in WH2
 *   - applyScanReceiveOrderLine({ ..., warehouseId}) → order RECEIPT lands in WH2
 *   - applyPickLine({ ..., warehouseId })          → CONSUMPTION debits WH2 bin
 *   - applyPackLine({ ..., warehouseId })          → CONSUMPTION debits WH2 bin
 *   - resolveWarehouseId tenant guard: a real id passes, a forged id → default
 *
 * RED (before the fix): the lib functions ignore the extra warehouseId and
 * resolve defaultWarehouseId internally, so every write lands in MAIN and the
 * "WH2 on-hand" assertions fail.
 *
 * Fixtures use VERIFY-WWR- prefixes; a throwaway WH2 warehouse is created + dropped.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { TENANT_KEY, STAGING_LOCATION } from "../lib/wms-host";
import { placeStock } from "../lib/wms/public";
import { applyAdjustment } from "../lib/warehouse/adjust";
import { applyScanReceiveOrderLine, applyBlindReceive } from "../lib/warehouse/scan-receive";
import { openPickLinesForOrder, applyPickLine } from "../lib/warehouse/pick";
import { openPackLinesForOrder, applyPackLine } from "../lib/warehouse/pack";
import { resolveWarehouseId } from "../app/actions/warehouses";

const MAIN = "wh_main_geleoteka";
const WH2 = "wh-wwr-test";
const PREFIX = "VERIFY-WWR-";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function onHand(partId: string, warehouseId: string): Promise<number> {
  const si = (await db.stockItem.findUnique({
    where: { partId_warehouseId: { partId, warehouseId } },
    select: { quantity: true },
  })) as { quantity: number } | null;
  return si?.quantity ?? 0;
}

async function binQty(partId: string, location: string, warehouseId: string): Promise<number> {
  const bin = (await db.stockBin.findFirst({
    where: { item: { partId, warehouseId }, location: location.toUpperCase(), tenantKey: TENANT_KEY },
    select: { quantity: true },
  })) as { quantity: number } | null;
  return bin?.quantity ?? 0;
}

let seq = 0;
function nextSuffix(): string {
  seq += 1;
  return `${Date.now()}-${seq}`;
}

/** A part with a StockItem in BOTH warehouses (`mainQty` in MAIN, `wh2Qty` in WH2). */
async function makePart(mainQty: number, wh2Qty: number): Promise<string> {
  const suffix = nextSuffix();
  const p = (await db.part.create({
    data: {
      slug: `verify-wwr-${suffix}`,
      article: `${PREFIX}${suffix}`,
      name: `verify wwr ${suffix}`,
      price: 100,
      stockItems: {
        create: [
          { warehouseId: MAIN, quantity: mainQty, tenantKey: TENANT_KEY },
          { warehouseId: WH2, quantity: wh2Qty, tenantKey: TENANT_KEY },
        ],
      },
    },
    select: { id: true },
  })) as { id: string };
  return p.id;
}

async function makeUser(): Promise<string> {
  const s = nextSuffix();
  const phone = `+79${String(seq).padStart(2, "0")}${`${Date.now()}`.slice(-7)}`;
  const u = (await db.user.create({
    data: { email: `verify-wwr-${s}@test.local`, phone, name: `verify wwr ${s}` },
    select: { id: true },
  })) as { id: string };
  return u.id;
}

async function makeOrderLine(
  userId: string,
  partId: string,
  qty: number,
  num: string,
): Promise<{ orderId: string; lineId: string }> {
  const createOrder = db.supplierOrder.create as unknown as (
    args: unknown,
  ) => Promise<{ id: string; items: Array<{ id: string }> }>;
  const order = await createOrder({
    data: {
      userId,
      orderNumber: `${PREFIX}${num}`,
      orderDate: new Date(),
      status: "ORDERED",
      items: {
        create: [{ type: "PART", partId, description: "verify line", quantity: qty, unitCost: 100, totalCost: 100 * qty }],
      },
    },
    select: { id: true, items: { select: { id: true } } },
  });
  return { orderId: order.id, lineId: order.items[0].id };
}

/** RepairOrder + APPROVED estimate PART line (for picking). */
async function makeRepairOrder(partId: string, qty: number): Promise<{ roId: string; lineId: string }> {
  const userId = await makeUser();
  const deal = (await db.deal.create({
    data: { customerUserId: userId, channel: "SERVICE" },
    select: { id: true },
  })) as { id: string };
  const est = (await db.estimate.create({
    data: {
      dealId: deal.id,
      stage: "APPROVED",
      approvedAt: new Date(),
      estimateLines: { create: [{ type: "PART", description: "verify pick", qty, partId, sortOrder: 0 }] },
    },
    select: { estimateLines: { select: { id: true } } },
  })) as { estimateLines: Array<{ id: string }> };
  const v = (await db.vehicle.create({
    data: { ownerUserId: userId, vin: `${PREFIX}${nextSuffix()}`, model: "G 500", year: 2024 },
    select: { id: true },
  })) as { id: string };
  const ro = (await db.repairOrder.create({
    data: { userId, vehicleId: v.id, dealId: deal.id, dateTime: new Date(), status: "IN_PROGRESS" },
    select: { id: true },
  })) as { id: string };
  return { roId: ro.id, lineId: est.estimateLines[0].id };
}

/** CRM PartShipment (PROCESSING) + APPROVED estimate PART line (for packing). */
async function makePartShipment(partId: string, qty: number): Promise<{ orderId: string; lineKey: string }> {
  const userId = await makeUser();
  const deal = (await db.deal.create({
    data: { customerUserId: userId, channel: "PARTS_WHOLESALE" },
    select: { id: true },
  })) as { id: string };
  const est = (await db.estimate.create({
    data: {
      dealId: deal.id,
      stage: "APPROVED",
      approvedAt: new Date(),
      estimateLines: { create: [{ type: "PART", description: "verify pack", qty, partId, sortOrder: 0 }] },
    },
    select: { estimateLines: { select: { id: true } } },
  })) as { estimateLines: Array<{ id: string }> };
  const order = (await db.partShipment.create({
    data: {
      userId,
      dealId: deal.id,
      status: "PROCESSING",
      total: 0,
      contactName: "verify wwr",
      contactPhone: "+70000000000",
      contactEmail: "verify-wwr-order@test.local",
    },
    select: { id: true },
  })) as { id: string };
  return { orderId: order.id, lineKey: est.estimateLines[0].id };
}

async function cleanup(): Promise<void> {
  await db.vehicle.deleteMany({ where: { vin: { startsWith: PREFIX } } });
  await db.user.deleteMany({ where: { email: { startsWith: "verify-wwr-" } } });
  await db.supplierOrder.deleteMany({ where: { orderNumber: { startsWith: PREFIX } } });
  await db.part.deleteMany({ where: { article: { startsWith: PREFIX } } });
  await db.stockLocation.deleteMany({ where: { warehouseId: WH2 } });
  await db.warehouse.deleteMany({ where: { id: WH2 } });
}

async function main(): Promise<void> {
  console.log("[verify-warehouse-write-routing] starting");
  await cleanup();

  await db.warehouse.create({
    data: { id: WH2, code: "WWR2", name: `${PREFIX}second`, tenantKey: TENANT_KEY, isDefault: false },
  });

  const admin = (await db.user.findFirst({
    where: { email: "admin@geleoteka.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(admin, "seed admin@geleoteka.ru not found");

  // ── adjust ────────────────────────────────────────────────────────────────
  {
    const p = await makePart(0, 0);
    await db.$transaction((tx) => applyAdjustment(tx, p, 7, admin.id, "verify wwr adjust", `${PREFIX}adj`, WH2));
    assert((await onHand(p, WH2)) === 7, `adjust: WH2 on-hand should be 7 (got ${await onHand(p, WH2)})`);
    assert((await onHand(p, MAIN)) === 0, `adjust: MAIN must be untouched 0 (got ${await onHand(p, MAIN)})`);
    console.log("  ✓ applyAdjustment routes to WH2, MAIN untouched");
  }

  // ── blind receive ───────────────────────────────────────────────────────────
  {
    const p = await makePart(0, 0);
    await db.$transaction((tx) =>
      applyBlindReceive(tx, {
        partId: p,
        qty: 4,
        location: STAGING_LOCATION,
        idempotencyKey: `${PREFIX}blind`,
        actorId: admin.id,
        warehouseId: WH2,
      }),
    );
    assert((await onHand(p, WH2)) === 4, `blind: WH2 on-hand should be 4 (got ${await onHand(p, WH2)})`);
    assert((await onHand(p, MAIN)) === 0, `blind: MAIN must be untouched 0 (got ${await onHand(p, MAIN)})`);
    assert((await binQty(p, STAGING_LOCATION, WH2)) === 4, "blind: 4 placed into WH2 ПРИЁМКА");
    assert((await binQty(p, STAGING_LOCATION, MAIN)) === 0, "blind: MAIN ПРИЁМКА untouched");
    console.log("  ✓ applyBlindReceive routes to WH2, MAIN untouched");
  }

  // ── order-backed receive ─────────────────────────────────────────────────────
  {
    const p = await makePart(0, 0);
    const { orderId, lineId } = await makeOrderLine(admin.id, p, 2, "ord");
    const r = await db.$transaction((tx) =>
      applyScanReceiveOrderLine(tx, {
        orderId,
        lineId,
        qty: 2,
        expectedReceived: 0,
        location: STAGING_LOCATION,
        actorId: admin.id,
        warehouseId: WH2,
      }),
    );
    assert(r.error === null, `order receive should succeed, got: ${r.error}`);
    assert((await onHand(p, WH2)) === 2, `order receive: WH2 on-hand should be 2 (got ${await onHand(p, WH2)})`);
    assert((await onHand(p, MAIN)) === 0, `order receive: MAIN must be untouched 0 (got ${await onHand(p, MAIN)})`);
    console.log("  ✓ applyScanReceiveOrderLine routes to WH2, MAIN untouched");
  }

  // ── pick (consume from WH2 bin) ──────────────────────────────────────────────
  {
    const CELL = `${PREFIX}PICK`;
    const p = await makePart(5, 5); // 5 on-hand in each warehouse
    await placeStock(db, { itemId: p, warehouseId: WH2, location: CELL, qty: 5, tenantKey: TENANT_KEY });
    const { roId, lineId } = await makeRepairOrder(p, 2);
    const open = await openPickLinesForOrder(db, roId, WH2);
    assert(open.length === 1 && open[0].bins.some((b) => b.location === CELL.toUpperCase()), "pick: WH2 bin shown on open line");
    await db.$transaction((tx) =>
      applyPickLine(tx, { repairOrderId: roId, lineId, partId: p, location: CELL, actorId: admin.id, warehouseId: WH2 }),
    );
    assert((await onHand(p, WH2)) === 3, `pick: WH2 on-hand 5−2=3 (got ${await onHand(p, WH2)})`);
    assert((await onHand(p, MAIN)) === 5, `pick: MAIN must be untouched 5 (got ${await onHand(p, MAIN)})`);
    assert((await binQty(p, CELL, WH2)) === 3, "pick: WH2 bin 5−2=3");
    console.log("  ✓ applyPickLine consumes WH2 bin, MAIN untouched");
  }

  // ── pack (consume from WH2 bin) ──────────────────────────────────────────────
  {
    const CELL = `${PREFIX}PACK`;
    const p = await makePart(5, 5);
    await placeStock(db, { itemId: p, warehouseId: WH2, location: CELL, qty: 5, tenantKey: TENANT_KEY });
    const { orderId, lineKey } = await makePartShipment(p, 2);
    const open = await openPackLinesForOrder(db, orderId, WH2);
    assert(open.length === 1 && open[0].bins.some((b) => b.location === CELL.toUpperCase()), "pack: WH2 bin shown on open line");
    await db.$transaction((tx) =>
      applyPackLine(tx, { orderId, lineKey, partId: p, location: CELL, actorId: admin.id, warehouseId: WH2 }),
    );
    assert((await onHand(p, WH2)) === 3, `pack: WH2 on-hand 5−2=3 (got ${await onHand(p, WH2)})`);
    assert((await onHand(p, MAIN)) === 5, `pack: MAIN must be untouched 5 (got ${await onHand(p, MAIN)})`);
    assert((await binQty(p, CELL, WH2)) === 3, "pack: WH2 bin 5−2=3");
    console.log("  ✓ applyPackLine consumes WH2 bin, MAIN untouched");
  }

  // ── resolveWarehouseId tenant guard (action boundary) ────────────────────────
  {
    assert((await resolveWarehouseId(WH2)) === WH2, "resolveWarehouseId: a real tenant id passes through");
    const forged = await resolveWarehouseId("forged-not-a-real-id");
    assert(forged !== WH2, "resolveWarehouseId: a forged id never resolves to WH2");
    assert(forged === MAIN, `resolveWarehouseId: a forged id falls back to default MAIN (got ${forged})`);
    console.log("  ✓ resolveWarehouseId validates tenant membership, forged id → default");
  }

  await cleanup();
  console.log("[verify-warehouse-write-routing] ALL PASS");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("[verify-warehouse-write-routing] ERROR", e);
  await db.$disconnect();
  process.exit(1);
});
