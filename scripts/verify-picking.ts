/**
 * Verifies WMS Phase 4 bin-aware picking against the dev DB.
 *
 * Task 1 — consumeStock core op (scenarios a–f):
 *  (a) auto-path consuming WITHIN unplaced leaves bins untouched
 *  (b) auto-path consuming BEYOND unplaced pulls the remainder from bins; a
 *      replay with the same source triple is a no-op (no extra bin pull)
 *  (c) auto-path FIFO: bins drained oldest-first, spanning into the next bin
 *  (d) drift-heal: a part with pre-existing Σbins>quantity converges to Σbins=quantity
 *  (e) explicit fromLocation consumes from that exact bin
 *  (f) explicit fromLocation with a short bin throws INSUFFICIENT_BIN and rolls
 *      back the whole tx (no movement, no bin change)
 *
 * Task 2 — production call sites routed through consumeStock (scenarios cp1–cp2)
 * Task 3 — scan-to-pick for repair orders (scenarios g–i)
 *
 * Fixtures use VERIFY-PICK- prefixes so cleanup is a prefix delete + cascade.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { WmsError, placeStock, consumeStock, binsForItem } from "../lib/wms/public";
import { TENANT_KEY } from "../lib/wms-host";
import { consumeApprovedEstimateParts } from "../lib/fulfillment/consume-parts";
import { openPickLinesForOrder, applyPickLine, PickError } from "../lib/warehouse/pick";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function assertThrowsCode(fn: () => Promise<unknown>, code: string, msg: string): Promise<WmsError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof WmsError && e.code === code) return e;
    console.error(`FAIL: ${msg} — expected WmsError ${code}, got:`, e);
    process.exit(1);
  }
  console.error(`FAIL: ${msg} — expected throw ${code}, but it resolved`);
  process.exit(1);
  throw new Error("unreachable");
}

async function onHand(partId: string): Promise<number> {
  const si = (await db.stockItem.findUnique({ where: { partId }, select: { quantity: true } })) as
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

async function cleanup(): Promise<void> {
  // Users cascade to Deal → Estimate/RepairOrder; Parts cascade to StockItem →
  // StockMovement/StockBin. Vehicles are SetNull on owner, so delete them by their
  // own VERIFY-PICK vin marker. Order: vehicles (→ cascade RO), users, parts, locs.
  await db.vehicle.deleteMany({ where: { vin: { startsWith: "VERIFY-PICK-" } } });
  await db.user.deleteMany({ where: { email: { startsWith: "verify-pick-" } } });
  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-PICK-" } } });
  await db.stockLocation.deleteMany({ where: { code: { startsWith: "VERIFY-PICK-" } } });
}

let dealSeq = 0;
/** Build a customer + Deal + APPROVED Estimate with PART lines for the given
 *  parts. Returns dealId + userId + the created estimate lineIds (in order). */
async function makeApprovedPartDeal(
  lines: Array<{ partId: string; qty: number }>,
): Promise<{ dealId: string; userId: string; lineIds: string[] }> {
  dealSeq += 1;
  const s = `${Date.now()}-${dealSeq}`;
  const phone = `+79${String(dealSeq).padStart(2, "0")}${`${Date.now()}`.slice(-7)}`;
  const user = (await db.user.create({
    data: { email: `verify-pick-${s}@test.local`, phone, name: `verify pick ${s}` },
    select: { id: true },
  })) as { id: string };
  const deal = (await db.deal.create({
    data: { customerUserId: user.id, channel: "SERVICE" },
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
          description: `verify pick line ${i}`,
          qty: l.qty,
          partId: l.partId,
          sortOrder: i,
        })),
      },
    },
    select: { estimateLines: { orderBy: { sortOrder: "asc" }, select: { id: true } } },
  })) as { estimateLines: Array<{ id: string }> };
  return { dealId: deal.id, userId: user.id, lineIds: est.estimateLines.map((l) => l.id) };
}

/** Build a RepairOrder for an existing customer + deal (needs a Vehicle). */
async function makeRepairOrder(
  userId: string,
  dealId: string,
  status: "SCHEDULED" | "IN_PROGRESS" | "READY" | "COMPLETED" | "CANCELLED" = "IN_PROGRESS",
): Promise<string> {
  const s = `${Date.now()}-${dealSeq}`;
  const v = (await db.vehicle.create({
    data: { ownerUserId: userId, vin: `VERIFY-PICK-${s}`, model: "G 500", year: 2024 },
    select: { id: true },
  })) as { id: string };
  const ro = (await db.repairOrder.create({
    data: { userId, vehicleId: v.id, dealId, dateTime: new Date(), status },
    select: { id: true },
  })) as { id: string };
  return ro.id;
}

let partSeq = 0;
/** Create a part with a StockItem at `qty` on-hand (unplaced). */
async function makePart(qty: number): Promise<string> {
  partSeq += 1;
  const suffix = `${Date.now()}-${partSeq}`;
  const p = (await db.part.create({
    data: {
      slug: `verify-pick-${suffix}`,
      article: `VERIFY-PICK-${suffix}`,
      name: `verify pick ${suffix}`,
      price: 100,
      stockItem: { create: { quantity: qty, tenantKey: TENANT_KEY } },
    },
    select: { id: true },
  })) as { id: string };
  return p.id;
}

async function main(): Promise<void> {
  console.log("[verify-picking] starting");
  await cleanup();

  // ── (a) auto-path consuming WITHIN unplaced leaves bins untouched ─────────
  {
    const CELL = "VERIFY-PICK-AA";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, location: CELL, qty: 4, tenantKey: TENANT_KEY });
    await consumeStock(db, {
      item: { itemId: p },
      qty: 3,
      source: { type: "VerifyPick", id: `a:${p}` },
      tenantKey: TENANT_KEY,
    });
    assert((await onHand(p)) === 7, "(a) on-hand 10−3=7");
    assert((await binQty(p, CELL)) === 4, "(a) bin untouched (3 came from unplaced 6)");
    assert((await sumBins(p)) === 4, "(a) Σbins still 4 ≤ 7");
    console.log("(a) PASS — consume within unplaced leaves bins untouched");
  }

  // ── (b) auto-path consuming BEYOND unplaced pulls from bins; replay no-op ──
  {
    const CELL = "VERIFY-PICK-BB";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, location: CELL, qty: 8, tenantKey: TENANT_KEY }); // unplaced 2
    const src = { type: "VerifyPick", id: `b:${p}` };
    await consumeStock(db, { item: { itemId: p }, qty: 5, source: src, tenantKey: TENANT_KEY });
    assert((await onHand(p)) === 5, "(b) on-hand 10−5=5");
    // needed = Σbins(8) − quantity(5) = 3 pulled from the bin
    assert((await binQty(p, CELL)) === 5, "(b) bin 8−3=5");
    assert((await sumBins(p)) === 5, "(b) Σbins 5 = quantity 5");
    const place = await binsForItem(db, p, TENANT_KEY);
    assert(place.reconcileNeeded === false, "(b) no reconcile drift");
    // replay same source triple → no-op, no extra bin pull
    await consumeStock(db, { item: { itemId: p }, qty: 5, source: src, tenantKey: TENANT_KEY });
    assert((await onHand(p)) === 5, "(b) replay: on-hand unchanged");
    assert((await sumBins(p)) === 5, "(b) replay: Σbins unchanged (no extra PICK)");
    console.log("(b) PASS — consume beyond unplaced pulls bins; replay is a no-op");
  }

  // ── (c) auto FIFO: oldest bin drained first, spanning into the next ───────
  {
    const CELL1 = "VERIFY-PICK-C1"; // created first (oldest)
    const CELL2 = "VERIFY-PICK-C2";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, location: CELL1, qty: 3, tenantKey: TENANT_KEY });
    await placeStock(db, { itemId: p, location: CELL2, qty: 4, tenantKey: TENANT_KEY }); // Σbins 7, unplaced 3
    await consumeStock(db, {
      item: { itemId: p },
      qty: 8,
      source: { type: "VerifyPick", id: `c:${p}` },
      tenantKey: TENANT_KEY,
    });
    // quantity 2; needed = 7−2 = 5 → drain CELL1(3) then CELL2(2)
    assert((await onHand(p)) === 2, "(c) on-hand 10−8=2");
    assert((await binQty(p, CELL1)) === 0, "(c) oldest bin drained first (CELL1 0)");
    assert((await binQty(p, CELL2)) === 2, "(c) newer bin partially drained (CELL2 2)");
    assert((await sumBins(p)) === 2, "(c) Σbins 2 = quantity 2");
    console.log("(c) PASS — FIFO drains oldest bin first, spanning into next");
  }

  // ── (d) drift-heal: pre-existing Σbins>quantity converges ─────────────────
  {
    const CELL = "VERIFY-PICK-DD";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, location: CELL, qty: 10, tenantKey: TENANT_KEY }); // Σbins 10 = qty 10
    // Simulate a legacy Phase-1 aggregate consumption that lowered on-hand WITHOUT
    // touching the bin (the drift this phase heals): quantity 10 → 7, bin still 10.
    await db.stockItem.update({ where: { partId: p }, data: { quantity: 7 } });
    let place = await binsForItem(db, p, TENANT_KEY);
    assert(place.reconcileNeeded === true, "(d) precondition: drift present (Σbins 10 > qty 7)");
    await consumeStock(db, {
      item: { itemId: p },
      qty: 3,
      source: { type: "VerifyPick", id: `d:${p}` },
      tenantKey: TENANT_KEY,
    });
    // quantity 7−3=4; needed = Σbins(10) − 4 = 6 pulled → bin 4
    assert((await onHand(p)) === 4, "(d) on-hand 7−3=4");
    assert((await sumBins(p)) === 4, "(d) Σbins healed to 4 = quantity");
    place = await binsForItem(db, p, TENANT_KEY);
    assert(place.reconcileNeeded === false, "(d) drift cleared");
    console.log("(d) PASS — pre-existing drift heals toward Σbins=quantity");
  }

  // ── (e) explicit fromLocation consumes from that exact bin ────────────────
  {
    const CELL = "VERIFY-PICK-EE";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, location: CELL, qty: 6, tenantKey: TENANT_KEY });
    await consumeStock(db, {
      item: { itemId: p },
      qty: 4,
      source: { type: "VerifyPick", id: `e:${p}` },
      fromLocation: CELL,
      tenantKey: TENANT_KEY,
    });
    assert((await onHand(p)) === 6, "(e) on-hand 10−4=6");
    assert((await binQty(p, CELL)) === 2, "(e) explicit bin 6−4=2");
    console.log("(e) PASS — explicit fromLocation deducts that exact bin");
  }

  // ── (f) explicit fromLocation short bin → INSUFFICIENT_BIN, full rollback ─
  {
    const CELL = "VERIFY-PICK-FF";
    const p = await makePart(10);
    await placeStock(db, { itemId: p, location: CELL, qty: 2, tenantKey: TENANT_KEY });
    await assertThrowsCode(
      () =>
        consumeStock(db, {
          item: { itemId: p },
          qty: 5,
          source: { type: "VerifyPick", id: `f:${p}` },
          fromLocation: CELL,
          tenantKey: TENANT_KEY,
        }),
      "INSUFFICIENT_BIN",
      "(f) short explicit bin rejects",
    );
    assert((await onHand(p)) === 10, "(f) rollback: on-hand unchanged (no movement)");
    assert((await binQty(p, CELL)) === 2, "(f) rollback: bin unchanged");
    const mv = await db.stockMovement.count({
      where: { sourceType: "VerifyPick", sourceId: `f:${p}`, reason: "CONSUMPTION" },
    });
    assert(mv === 0, "(f) rollback: no CONSUMPTION movement persisted");
    console.log("(f) PASS — short explicit bin rejects and rolls back the whole tx");
  }

  // ── (cp1) consumeApprovedEstimateParts now deducts bins (Task 2 wiring) ────
  {
    const CELL = "VERIFY-PICK-CP1";
    const p = await makePart(5);
    await placeStock(db, { itemId: p, location: CELL, qty: 5, tenantKey: TENANT_KEY }); // fully placed, unplaced 0
    const { dealId } = await makeApprovedPartDeal([{ partId: p, qty: 2 }]);
    const src = `VERIFY-PICK-ro-${dealId}`;
    await db.$transaction((tx) =>
      consumeApprovedEstimateParts(tx, { dealId, sourceType: "RepairOrder", sourceId: src }),
    );
    assert((await onHand(p)) === 3, "(cp1) on-hand 5−2=3");
    assert((await sumBins(p)) === 3, "(cp1) bin deducted 5−2=3 (would be 5/drift before Task 2)");
    const place = await binsForItem(db, p, TENANT_KEY);
    assert(place.reconcileNeeded === false, "(cp1) no drift after close");
    // Idempotent re-close: same source triple → no double consume, no tx poison.
    await db.$transaction((tx) =>
      consumeApprovedEstimateParts(tx, { dealId, sourceType: "RepairOrder", sourceId: src }),
    );
    assert((await onHand(p)) === 3, "(cp1) re-close idempotent: on-hand still 3");
    assert((await sumBins(p)) === 3, "(cp1) re-close idempotent: Σbins still 3");
    console.log("(cp1) PASS — consumeApprovedEstimateParts deducts bins + idempotent re-close");
  }

  // ── (g) WRONG_ITEM: scanned part not on the order line is rejected ────────
  {
    const CELL = "VERIFY-PICK-GG";
    const partA = await makePart(5);
    const partB = await makePart(5); // NOT on the order
    await placeStock(db, { itemId: partA, location: CELL, qty: 5, tenantKey: TENANT_KEY });
    await placeStock(db, { itemId: partB, location: CELL, qty: 5, tenantKey: TENANT_KEY });
    const { dealId, userId, lineIds } = await makeApprovedPartDeal([{ partId: partA, qty: 2 }]);
    const roId = await makeRepairOrder(userId, dealId);
    const err = (await (async () => {
      try {
        await db.$transaction((tx) =>
          applyPickLine(tx, { repairOrderId: roId, lineId: lineIds[0], partId: partB, location: CELL }),
        );
      } catch (e) {
        return e;
      }
      return null;
    })()) as unknown;
    assert(err instanceof PickError && err.code === "WRONG_ITEM", "(g) wrong part → PickError WRONG_ITEM");
    assert((await onHand(partA)) === 5 && (await onHand(partB)) === 5, "(g) no stock change on either part");
    console.log("(g) PASS — scanned part not on the order is rejected with WRONG_ITEM");
  }

  // ── (h) happy pick consumes the full line from the scanned bin ────────────
  {
    const CELL = "VERIFY-PICK-HH";
    const partA = await makePart(5);
    await placeStock(db, { itemId: partA, location: CELL, qty: 5, tenantKey: TENANT_KEY });
    const { dealId, userId, lineIds } = await makeApprovedPartDeal([{ partId: partA, qty: 2 }]);
    const roId = await makeRepairOrder(userId, dealId);
    let open = await openPickLinesForOrder(db, roId);
    assert(open.length === 1 && open[0].requiredQty === 2 && open[0].partId === partA, "(h) one open line, requiredQty 2");
    await db.$transaction((tx) =>
      applyPickLine(tx, { repairOrderId: roId, lineId: lineIds[0], partId: partA, location: CELL }),
    );
    assert((await onHand(partA)) === 3, "(h) on-hand 5−2=3");
    assert((await binQty(partA, CELL)) === 3, "(h) scanned bin 5−2=3");
    open = await openPickLinesForOrder(db, roId);
    assert(open.length === 0, "(h) line gone from open-pick list after picking");
    console.log("(h) PASS — happy pick consumes full line from the scanned bin");
  }

  // ── (i) pick then RO close → single consumption (idempotent, no under-consume)
  {
    const CELL = "VERIFY-PICK-II";
    const partA = await makePart(5);
    await placeStock(db, { itemId: partA, location: CELL, qty: 5, tenantKey: TENANT_KEY });
    const { dealId, userId, lineIds } = await makeApprovedPartDeal([{ partId: partA, qty: 2 }]);
    const roId = await makeRepairOrder(userId, dealId);
    await db.$transaction((tx) =>
      applyPickLine(tx, { repairOrderId: roId, lineId: lineIds[0], partId: partA, location: CELL }),
    );
    assert((await onHand(partA)) === 3, "(i) on-hand after pick = 3");
    // RO close fires consumeApprovedEstimateParts with the SAME RepairOrder source.
    await db.$transaction((tx) =>
      consumeApprovedEstimateParts(tx, { dealId, sourceType: "RepairOrder", sourceId: roId }),
    );
    assert((await onHand(partA)) === 3, "(i) close after pick: on-hand unchanged (no double consume)");
    const mvCount = await db.stockMovement.count({
      where: { sourceType: "RepairOrder", sourceId: `${roId}:${lineIds[0]}`, reason: "CONSUMPTION" },
    });
    assert(mvCount === 1, "(i) exactly ONE CONSUMPTION movement for the line (delta = full requiredQty)");
    console.log("(i) PASS — pick then close = single consumption, no under-consumption");
  }

  // ── (j) non-pickable RO (CANCELLED) consumes NOTHING, even by direct call ──
  {
    const CELL = "VERIFY-PICK-JJ";
    const partA = await makePart(5);
    await placeStock(db, { itemId: partA, location: CELL, qty: 5, tenantKey: TENANT_KEY });
    const { dealId, userId, lineIds } = await makeApprovedPartDeal([{ partId: partA, qty: 2 }]);
    const roId = await makeRepairOrder(userId, dealId, "CANCELLED");
    const open = await openPickLinesForOrder(db, roId);
    assert(open.length === 0, "(j) CANCELLED RO exposes no open pick lines");
    let threw = false;
    try {
      await db.$transaction((tx) =>
        applyPickLine(tx, { repairOrderId: roId, lineId: lineIds[0], partId: partA, location: CELL }),
      );
    } catch {
      threw = true;
    }
    assert(threw, "(j) direct applyPickLine on a CANCELLED RO is rejected");
    assert((await onHand(partA)) === 5, "(j) no stock consumed for a non-pickable order");
    assert((await sumBins(partA)) === 5, "(j) no bin deduction for a non-pickable order");
    console.log("(j) PASS — non-pickable (CANCELLED) RO consumes nothing");
  }

  await cleanup();
  console.log("[verify-picking] ALL PASS");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
