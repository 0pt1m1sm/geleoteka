/**
 * Verifies WMS Phase 4b packing/shipping domain (lib/warehouse/pack.ts) against
 * the dev DB.
 *
 *  (a) retail order (PartOrderItem, consumed at sale) → openPackLines empty,
 *      isFullyPacked true, packProgress packed === required
 *  (b) CRM order (APPROVED estimate, nothing consumed) → openPackLines = all
 *      estimate PART lines
 *  (c) applyPackLine happy → consumes bin-aware, line drops, movement at
 *      PartShipment:orderId:estLineId, Σbins === on-hand (no drift)
 *  (d) WRONG_ITEM: scanned part ≠ selected line's part → PackError, no movement
 *  (e) INSUFFICIENT_BIN: short explicit bin → WmsError, full rollback (no movement)
 *  (f) re-pack same line → no double consume (source-triple idempotency)
 *  (g) isFullyPacked false with an open line, true once every line packed
 *  (h) cross-check: after bin-aware pack of a CRM line, consumeApprovedEstimateParts
 *      (the dispatch path) consumes nothing extra (shared source triple)
 *  (i) non-PROCESSING (CANCELLED) order → openPackLines empty, applyPackLine refuses
 *  (j) partial-pack then dispatch top-up: pack 1 of 2 CRM lines → isFullyPacked
 *      false; consumeApprovedEstimateParts tops up line 2 (line 1 no-op), every
 *      part Σbins === on-hand, isFullyPacked true
 *
 * Fixtures use VERIFY-PACK- prefixes so cleanup is a prefix delete + cascade.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { WmsError, placeStock, consumeStock } from "../lib/wms/public";
import { TENANT_KEY } from "../lib/wms-host";
const WH = "wh_main_geleoteka";
import { consumeApprovedEstimateParts } from "../lib/fulfillment/consume-parts";
import {
  openPackLinesForOrder,
  applyPackLine,
  isFullyPacked,
  packProgress,
  PackError,
} from "../lib/warehouse/pack";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function onHand(partId: string): Promise<number> {
  const si = (await db.stockItem.findUnique({ where: { partId_warehouseId: { partId, warehouseId: WH } }, select: { quantity: true } })) as
    | { quantity: number }
    | null;
  return si?.quantity ?? 0;
}

async function binQty(partId: string, location: string): Promise<number> {
  const bin = (await db.stockBin.findFirst({
    where: { item: { partId }, location: location.toUpperCase(), tenantKey: TENANT_KEY },
    select: { quantity: true },
  })) as { quantity: number } | null;
  return bin?.quantity ?? 0;
}

async function sumBins(partId: string): Promise<number> {
  const rows = (await db.stockBin.findMany({
    where: { item: { partId }, tenantKey: TENANT_KEY },
    select: { quantity: true },
  })) as Array<{ quantity: number }>;
  return rows.reduce((s, b) => s + b.quantity, 0);
}

async function consumptionCount(orderId: string, lineKey: string): Promise<number> {
  return db.stockMovement.count({
    where: {
      sourceType: "PartShipment",
      sourceId: `${orderId}:${lineKey}`,
      reason: "CONSUMPTION",
    },
  });
}

async function cleanup(): Promise<void> {
  // Users cascade to Deal → Estimate + PartShipment (PartShipment.deal onDelete
  // Cascade). Parts cascade to StockItem → StockMovement/StockBin. Order: users,
  // parts, locations.
  await db.user.deleteMany({ where: { email: { startsWith: "verify-pack-" } } });
  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-PACK-" } } });
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "VERIFY-PACK-" } } });
}

let seq = 0;
function nextSuffix(): string {
  seq += 1;
  return `${Date.now()}-${seq}`;
}

/** Create a part with a StockItem at `qty` on-hand (unplaced). */
async function makePart(qty: number): Promise<string> {
  const suffix = nextSuffix();
  const p = (await db.part.create({
    data: {
      slug: `verify-pack-${suffix}`,
      article: `VERIFY-PACK-${suffix}`,
      name: `verify pack ${suffix}`,
      price: 100,
      stockItems: { create: { warehouseId: WH, quantity: qty, tenantKey: TENANT_KEY } },
    },
    select: { id: true },
  })) as { id: string };
  return p.id;
}

async function makeUser(): Promise<string> {
  const s = nextSuffix();
  const phone = `+79${String(seq).padStart(2, "0")}${`${Date.now()}`.slice(-7)}`;
  const u = (await db.user.create({
    data: { email: `verify-pack-${s}@test.local`, phone, name: `verify pack ${s}` },
    select: { id: true },
  })) as { id: string };
  return u.id;
}

/** A CRM-dispatched PartShipment: deal + APPROVED estimate PART lines, no items,
 *  status PROCESSING (nothing consumed yet). Returns orderId + estimate lineIds. */
async function makeCrmShipment(
  lines: Array<{ partId: string; qty: number }>,
  status: "PROCESSING" | "CANCELLED" = "PROCESSING",
): Promise<{ orderId: string; lineIds: string[] }> {
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
      estimateLines: {
        create: lines.map((l, i) => ({
          type: "PART",
          description: `verify pack line ${i}`,
          qty: l.qty,
          partId: l.partId,
          sortOrder: i,
        })),
      },
    },
    select: { estimateLines: { orderBy: { sortOrder: "asc" }, select: { id: true } } },
  })) as { estimateLines: Array<{ id: string }> };
  const order = (await db.partShipment.create({
    data: {
      userId,
      dealId: deal.id,
      status,
      total: 0,
      contactName: "verify pack",
      contactPhone: "+70000000000",
      contactEmail: "verify-pack-order@test.local",
    },
    select: { id: true },
  })) as { id: string };
  return { orderId: order.id, lineIds: est.estimateLines.map((l) => l.id) };
}

/** A retail PartShipment: PartOrderItem rows, deal with NO approved estimate,
 *  consumed at sale (CONSUMPTION movements keyed by partId), status PROCESSING. */
async function makeRetailShipment(
  items: Array<{ partId: string; qty: number }>,
): Promise<{ orderId: string }> {
  const userId = await makeUser();
  const deal = (await db.deal.create({
    data: { customerUserId: userId, channel: "PARTS_RETAIL" },
    select: { id: true },
  })) as { id: string };
  const order = (await db.partShipment.create({
    data: {
      userId,
      dealId: deal.id,
      status: "PROCESSING",
      total: 0,
      contactName: "verify pack retail",
      contactPhone: "+70000000001",
      contactEmail: "verify-pack-retail@test.local",
      items: { create: items.map((i) => ({ partId: i.partId, quantity: i.qty, unitPrice: 100 })) },
    },
    select: { id: true },
  })) as { id: string };
  // Mimic createPartOrder's point-of-sale consumption (source orderId:partId).
  for (const i of items) {
    await consumeStock(db, {
      item: { itemId: i.partId, warehouseId: WH },
      qty: i.qty,
      source: { type: "PartShipment", id: `${order.id}:${i.partId}` },
      tenantKey: TENANT_KEY,
    });
  }
  return { orderId: order.id };
}

async function main(): Promise<void> {
  console.log("[verify-packing] starting");
  await cleanup();

  // ── (a) retail order: consumed at sale → nothing open, fully packed ───────
  {
    const CELL = "VERIFY-PACK-AA";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, warehouseId: WH, location: CELL, qty: 6, tenantKey: TENANT_KEY });
    const { orderId } = await makeRetailShipment([{ partId: p, qty: 2 }]);
    const open = await openPackLinesForOrder(db, orderId);
    assert(open.length === 0, "(a) retail order has no open pack lines (consumed at sale)");
    assert((await isFullyPacked(db, orderId)) === true, "(a) retail order is fully packed");
    const prog = await packProgress(db, orderId);
    assert(prog.required === 1 && prog.packed === 1, "(a) packProgress 1/1 for retail");
    console.log("(a) PASS — retail order: consumed at sale, nothing to pack");
  }

  // ── (b) CRM order: estimate lines all open ────────────────────────────────
  {
    const p1 = await makePart(10);
    const p2 = await makePart(10);
    const { orderId, lineIds } = await makeCrmShipment([
      { partId: p1, qty: 2 },
      { partId: p2, qty: 3 },
    ]);
    const open = await openPackLinesForOrder(db, orderId);
    assert(open.length === 2, "(b) CRM order exposes both estimate PART lines as open");
    const byKey = new Map(open.map((l) => [l.lineKey, l]));
    assert(byKey.get(lineIds[0])?.requiredQty === 2, "(b) line 1 requiredQty 2");
    assert(byKey.get(lineIds[1])?.requiredQty === 3, "(b) line 2 requiredQty 3");
    console.log("(b) PASS — CRM order exposes all APPROVED-estimate PART lines");
  }

  // ── (c) happy pack: bin-aware consume, line drops, no drift ───────────────
  {
    const CELL = "VERIFY-PACK-CC";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, warehouseId: WH, location: CELL, qty: 10, tenantKey: TENANT_KEY });
    const { orderId, lineIds } = await makeCrmShipment([{ partId: p, qty: 4 }]);
    await db.$transaction((tx) =>
      applyPackLine(tx, { orderId, lineKey: lineIds[0], partId: p, location: CELL }),
    );
    assert((await onHand(p)) === 6, "(c) on-hand 10−4=6");
    assert((await binQty(p, CELL)) === 6, "(c) scanned bin 10−4=6");
    assert((await sumBins(p)) === (await onHand(p)), "(c) Σbins === on-hand (no drift)");
    assert((await consumptionCount(orderId, lineIds[0])) === 1, "(c) one movement at orderId:estLineId");
    const open = await openPackLinesForOrder(db, orderId);
    assert(open.length === 0, "(c) line gone from open list after packing");
    console.log("(c) PASS — happy pack consumes bin-aware, line drops, no drift");
  }

  // ── (d) WRONG_ITEM: scanned part not the selected line's part ─────────────
  {
    const CELL = "VERIFY-PACK-DD";
    const pA = await makePart(5);
    const pB = await makePart(5); // not on the order
    await placeStock(db, { itemId: pA, warehouseId: WH, location: CELL, qty: 5, tenantKey: TENANT_KEY });
    await placeStock(db, { itemId: pB, warehouseId: WH, location: CELL, qty: 5, tenantKey: TENANT_KEY });
    const { orderId, lineIds } = await makeCrmShipment([{ partId: pA, qty: 2 }]);
    let err: unknown = null;
    try {
      await db.$transaction((tx) =>
        applyPackLine(tx, { orderId, lineKey: lineIds[0], partId: pB, location: CELL }),
      );
    } catch (e) {
      err = e;
    }
    assert(err instanceof PackError && err.code === "WRONG_ITEM", "(d) wrong part → PackError WRONG_ITEM");
    assert((await onHand(pA)) === 5 && (await onHand(pB)) === 5, "(d) no stock change on either part");
    assert((await consumptionCount(orderId, lineIds[0])) === 0, "(d) no CONSUMPTION movement written");
    console.log("(d) PASS — wrong part rejected with WRONG_ITEM, no movement");
  }

  // ── (e) INSUFFICIENT_BIN: short explicit bin → rollback ───────────────────
  {
    const CELL = "VERIFY-PACK-EE";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, warehouseId: WH, location: CELL, qty: 2, tenantKey: TENANT_KEY });
    const { orderId, lineIds } = await makeCrmShipment([{ partId: p, qty: 5 }]);
    let err: unknown = null;
    try {
      await db.$transaction((tx) =>
        applyPackLine(tx, { orderId, lineKey: lineIds[0], partId: p, location: CELL }),
      );
    } catch (e) {
      err = e;
    }
    assert(
      err instanceof WmsError && err.code === "INSUFFICIENT_BIN",
      "(e) short bin → WmsError INSUFFICIENT_BIN",
    );
    assert((await onHand(p)) === 10, "(e) rollback: on-hand unchanged");
    assert((await binQty(p, CELL)) === 2, "(e) rollback: bin unchanged");
    assert((await consumptionCount(orderId, lineIds[0])) === 0, "(e) rollback: no movement persisted");
    console.log("(e) PASS — short explicit bin rejects and rolls back");
  }

  // ── (f) re-pack same line → no double consume ─────────────────────────────
  {
    const CELL = "VERIFY-PACK-FF";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, warehouseId: WH, location: CELL, qty: 10, tenantKey: TENANT_KEY });
    const { orderId, lineIds } = await makeCrmShipment([{ partId: p, qty: 3 }]);
    await db.$transaction((tx) =>
      applyPackLine(tx, { orderId, lineKey: lineIds[0], partId: p, location: CELL }),
    );
    assert((await onHand(p)) === 7, "(f) on-hand 10−3=7 after first pack");
    // Re-pack: the line is no longer open, so applyPackLine throws WRONG_ITEM
    // (line not found) — and crucially writes no second movement.
    let threw = false;
    try {
      await db.$transaction((tx) =>
        applyPackLine(tx, { orderId, lineKey: lineIds[0], partId: p, location: CELL }),
      );
    } catch {
      threw = true;
    }
    assert(threw, "(f) re-pack of a packed line is rejected (line no longer open)");
    assert((await onHand(p)) === 7, "(f) re-pack: on-hand unchanged (no double consume)");
    assert((await consumptionCount(orderId, lineIds[0])) === 1, "(f) still exactly one movement");
    console.log("(f) PASS — re-pack of a packed line does not double-consume");
  }

  // ── (g) isFullyPacked false with open line, true once all packed ──────────
  {
    const CELL = "VERIFY-PACK-GG";
    const p1 = await makePart(10);
    const p2 = await makePart(10);
    await placeStock(db, { itemId: p1, warehouseId: WH, location: CELL, qty: 10, tenantKey: TENANT_KEY });
    await placeStock(db, { itemId: p2, warehouseId: WH, location: CELL, qty: 10, tenantKey: TENANT_KEY });
    const { orderId, lineIds } = await makeCrmShipment([
      { partId: p1, qty: 1 },
      { partId: p2, qty: 1 },
    ]);
    assert((await isFullyPacked(db, orderId)) === false, "(g) not fully packed initially");
    await db.$transaction((tx) =>
      applyPackLine(tx, { orderId, lineKey: lineIds[0], partId: p1, location: CELL }),
    );
    assert((await isFullyPacked(db, orderId)) === false, "(g) still not fully packed after 1/2");
    const prog = await packProgress(db, orderId);
    assert(prog.packed === 1 && prog.required === 2, "(g) packProgress 1/2");
    await db.$transaction((tx) =>
      applyPackLine(tx, { orderId, lineKey: lineIds[1], partId: p2, location: CELL }),
    );
    assert((await isFullyPacked(db, orderId)) === true, "(g) fully packed after 2/2");
    console.log("(g) PASS — isFullyPacked tracks line completion");
  }

  // ── (h) cross-check: pack then dispatch path is a no-op ───────────────────
  {
    const CELL = "VERIFY-PACK-HH";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, warehouseId: WH, location: CELL, qty: 10, tenantKey: TENANT_KEY });
    const { orderId, lineIds } = await makeCrmShipment([{ partId: p, qty: 2 }]);
    const order = (await db.partShipment.findUnique({
      where: { id: orderId },
      select: { dealId: true },
    })) as { dealId: string };
    await db.$transaction((tx) =>
      applyPackLine(tx, { orderId, lineKey: lineIds[0], partId: p, location: CELL }),
    );
    assert((await onHand(p)) === 8, "(h) on-hand 10−2=8 after pack");
    // Dispatch path uses the SAME source triple → idempotent no-op.
    await db.$transaction((tx) =>
      consumeApprovedEstimateParts(tx, { dealId: order.dealId, sourceType: "PartShipment", sourceId: orderId }),
    );
    assert((await onHand(p)) === 8, "(h) dispatch after pack: on-hand unchanged (no double consume)");
    assert((await consumptionCount(orderId, lineIds[0])) === 1, "(h) still exactly one movement");
    console.log("(h) PASS — pack then dispatch is idempotent (shared source triple)");
  }

  // ── (i) non-PROCESSING (CANCELLED) order: nothing open, pack refused ──────
  {
    const CELL = "VERIFY-PACK-II";
    const p = await makePart(5);
    await placeStock(db, { itemId: p, warehouseId: WH, location: CELL, qty: 5, tenantKey: TENANT_KEY });
    const { orderId, lineIds } = await makeCrmShipment([{ partId: p, qty: 2 }], "CANCELLED");
    const open = await openPackLinesForOrder(db, orderId);
    assert(open.length === 0, "(i) CANCELLED order exposes no open pack lines");
    let threw = false;
    try {
      await db.$transaction((tx) =>
        applyPackLine(tx, { orderId, lineKey: lineIds[0], partId: p, location: CELL }),
      );
    } catch {
      threw = true;
    }
    assert(threw, "(i) direct applyPackLine on a CANCELLED order is rejected");
    assert((await onHand(p)) === 5, "(i) no stock consumed for a non-packable order");
    console.log("(i) PASS — non-PROCESSING order packs nothing");
  }

  // ── (j) partial pack then dispatch top-up ─────────────────────────────────
  {
    const CELL = "VERIFY-PACK-JJ";
    const p1 = await makePart(10);
    const p2 = await makePart(10);
    await placeStock(db, { itemId: p1, warehouseId: WH, location: CELL, qty: 10, tenantKey: TENANT_KEY });
    await placeStock(db, { itemId: p2, warehouseId: WH, location: CELL, qty: 10, tenantKey: TENANT_KEY });
    const { orderId, lineIds } = await makeCrmShipment([
      { partId: p1, qty: 2 },
      { partId: p2, qty: 3 },
    ]);
    const order = (await db.partShipment.findUnique({
      where: { id: orderId },
      select: { dealId: true },
    })) as { dealId: string };
    // Pack only line 1 (bin-aware).
    await db.$transaction((tx) =>
      applyPackLine(tx, { orderId, lineKey: lineIds[0], partId: p1, location: CELL }),
    );
    assert((await isFullyPacked(db, orderId)) === false, "(j) not fully packed after 1/2");
    assert((await onHand(p1)) === 8 && (await onHand(p2)) === 10, "(j) only line 1 consumed so far");
    // Simulate the manual dispatch path (Task 2's isFullyPacked-gated fix): it
    // runs consumeApprovedEstimateParts because the order is NOT fully packed.
    await db.$transaction((tx) =>
      consumeApprovedEstimateParts(tx, { dealId: order.dealId, sourceType: "PartShipment", sourceId: orderId }),
    );
    assert((await onHand(p1)) === 8, "(j) line 1 untouched by top-up (idempotent no-op)");
    assert((await onHand(p2)) === 7, "(j) line 2 consumed by dispatch top-up (10−3=7)");
    assert((await sumBins(p1)) === (await onHand(p1)), "(j) p1 Σbins === on-hand (no drift)");
    assert((await sumBins(p2)) === (await onHand(p2)), "(j) p2 Σbins === on-hand (no drift)");
    assert((await consumptionCount(orderId, lineIds[0])) === 1, "(j) line 1: exactly one movement");
    assert((await consumptionCount(orderId, lineIds[1])) === 1, "(j) line 2: exactly one movement");
    assert((await isFullyPacked(db, orderId)) === true, "(j) fully packed after top-up");
    console.log("(j) PASS — partial pack + dispatch top-up consumes remainder, no drift");
  }

  await cleanup();
  console.log("[verify-packing] ALL PASS");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
