/**
 * Verifies the warehouse module's stock primitives against the dev DB:
 *  - applyAdjustment reconciles on-hand to an absolute target via an ADJUSTMENT
 *    movement (delta = target − current), stamps the actor, no-ops when
 *    unchanged, and rolls back if the result would fall below 0 or below reserved.
 *  - StockItem.barcode/gtin per-field uniqueness (Task 6).
 *  - StockBin placement layer: place/transfer/remove invariants + audit (Task 8).
 *
 * Runs on a throwaway Part so cleanup is a single cascade delete.
 */
import "dotenv/config";
import { db } from "../lib/db";
import {
  recordMovement,
  placeStock,
  transferStock,
  removeFromBin,
  binsForItem,
  itemsInLocation,
  WmsError,
} from "../lib/wms/public";
import { applyAdjustment } from "../lib/warehouse/adjust";
import { assignCodes, DuplicateCodeError } from "../lib/warehouse/codes";
import { applyReceive, computeReceivingStatus, isReceivingStatus } from "../lib/warehouse/receive";

const TENANT = "geleoteka";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function movementCount(partId: string): Promise<number> {
  return db.stockMovement.count({ where: { item: { partId } } });
}

async function main(): Promise<void> {
  console.log("[verify-warehouse] starting");

  // Clean any leftovers from a prior run, then create a throwaway part + stock.
  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-WH-" } } });
  const admin = (await db.user.findFirst({
    where: { email: "admin@geleoteka.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(admin, "seed admin@geleoteka.ru not found");

  const part = (await db.part.create({
    data: {
      slug: "verify-wh-part-0001",
      article: "VERIFY-WH-0001",
      name: "verify-warehouse part",
      price: 100,
      stockItem: { create: { quantity: 10, tenantKey: TENANT } },
    },
    select: { id: true },
  })) as { id: string };
  const partId = part.id;

  // --- adjustStock core: reconcile up ---
  const r1 = await db.$transaction((tx) => applyAdjustment(tx, partId, 25, undefined, "verify-warehouse up"));
  assert(r1.quantity === 25, `expected on-hand 25 after adjust, got ${r1.quantity}`);
  const mv1 = (await db.stockMovement.findFirst({
    where: { item: { partId }, reason: "ADJUSTMENT" },
    orderBy: { createdAt: "desc" },
    select: { quantityDelta: true },
  })) as { quantityDelta: number } | null;
  assert(mv1 && mv1.quantityDelta === 15, `expected ADJUSTMENT delta +15, got ${mv1?.quantityDelta}`);
  console.log("  ✓ adjust reconciles on-hand to target via ADJUSTMENT (delta = target − current)");

  // --- actor stamp ---
  await db.$transaction((tx) => applyAdjustment(tx, partId, 30, admin.id, "verify-warehouse actor"));
  const mv2 = (await db.stockMovement.findFirst({
    where: { item: { partId }, reason: "ADJUSTMENT" },
    orderBy: { createdAt: "desc" },
    select: { actorUserId: true, quantityDelta: true },
  })) as { actorUserId: string | null; quantityDelta: number } | null;
  assert(mv2 && mv2.actorUserId === admin.id, "ADJUSTMENT must stamp actorUserId");
  console.log("  ✓ adjust stamps actorUserId");

  // --- no-op when unchanged ---
  const before = await movementCount(partId);
  const r3 = await db.$transaction((tx) => applyAdjustment(tx, partId, 30, undefined));
  const after = await movementCount(partId);
  assert(r3.quantity === 30 && after === before, "no-op adjust must not write a movement");
  console.log("  ✓ adjust is a no-op when target equals current (no movement)");

  // --- negative-result guard rolls back ---
  // Raise reserved to 20, then attempt to drop on-hand to 10 (< reserved) → must roll back.
  await recordMovement(db, {
    item: { itemId: partId },
    reason: "RESERVATION",
    qty: 20,
    source: { type: "VerifyWh", id: "reserve-1" },
    tenantKey: TENANT,
  });
  const guardBefore = await movementCount(partId);
  let threw = false;
  try {
    await db.$transaction((tx) => applyAdjustment(tx, partId, 10, undefined, "verify-warehouse below-reserved"));
  } catch {
    threw = true;
  }
  const guardAfter = await movementCount(partId);
  const si = (await db.stockItem.findUnique({
    where: { partId },
    select: { quantity: true },
  })) as { quantity: number };
  assert(threw, "adjust below reserved must throw");
  assert(si.quantity === 30 && guardAfter === guardBefore, "negative-result guard must roll back (no movement, on-hand unchanged)");
  console.log("  ✓ adjust below reserved/zero rolls back (no movement, on-hand unchanged)");

  // --- barcode/gtin per-field uniqueness (Task 6) ---
  await db.part.create({
    data: {
      slug: "verify-wh-part-0002",
      article: "VERIFY-WH-0002",
      name: "verify-warehouse part 2",
      price: 100,
      stockItem: { create: { quantity: 0, tenantKey: TENANT, barcode: "VERIFY-BC-1" } },
    },
  });

  // Assigning a fresh barcode succeeds and resolves via lookup.
  await assignCodes(db, partId, "VERIFY-BC-2", null);
  const resolved = (await db.stockItem.findFirst({
    where: { tenantKey: TENANT, barcode: "VERIFY-BC-2" },
    select: { partId: true },
  })) as { partId: string } | null;
  assert(resolved && resolved.partId === partId, "assigned barcode must resolve to the part");
  console.log("  ✓ assignCodes sets a unique barcode (resolvable by lookup)");

  // Assigning part2's barcode to part1 is rejected and not persisted.
  let dupeThrew = false;
  try {
    await assignCodes(db, partId, "VERIFY-BC-1", null);
  } catch (e) {
    dupeThrew = e instanceof DuplicateCodeError && e.field === "barcode";
  }
  const stillOwn = (await db.stockItem.findUnique({
    where: { partId },
    select: { barcode: true },
  })) as { barcode: string | null };
  assert(dupeThrew, "duplicate barcode must throw DuplicateCodeError(barcode)");
  assert(stillOwn.barcode === "VERIFY-BC-2", "rejected duplicate must not overwrite the existing barcode");
  console.log("  ✓ assignCodes rejects a barcode already held by another item (per-field uniqueness)");

  // --- StockBin placement layer (Task 8) ---
  // partId currently: on-hand 30, reserved 20, 0 placed → unplaced 30.
  await placeStock(db, { itemId: partId, location: "a-1-1", qty: 5, tenantKey: TENANT });
  let placement = await binsForItem(db, partId, TENANT);
  assert(placement.placed === 5 && placement.unplaced === 25, `after place: placed 5/unplaced 25, got ${placement.placed}/${placement.unplaced}`);
  const placeMv = await db.stockBinMovement.count({ where: { item: { partId }, reason: "PLACE" } });
  assert(placeMv === 1, "place writes one PLACE audit row");
  // location is normalized to upper-case.
  assert(placement.bins.some((b) => b.location === "A-1-1" && b.quantity === 5), "bin A-1-1 holds 5 (normalized upper-case)");
  console.log("  ✓ placeStock puts unplaced into a bin (normalized), audited PLACE");

  // place beyond unplaced is rejected.
  let overThrew = false;
  try {
    await placeStock(db, { itemId: partId, location: "C-9", qty: 1000, tenantKey: TENANT });
  } catch (e) {
    overThrew = e instanceof WmsError && e.code === "INSUFFICIENT_UNPLACED";
  }
  assert(overThrew, "place beyond unplaced must throw INSUFFICIENT_UNPLACED");
  console.log("  ✓ placeStock rejects qty > unplaced");

  // transfer between bins.
  await transferStock(db, { itemId: partId, from: "A-1-1", to: "B-2", qty: 2, tenantKey: TENANT });
  placement = await binsForItem(db, partId, TENANT);
  const a11 = placement.bins.find((b) => b.location === "A-1-1");
  const b2 = placement.bins.find((b) => b.location === "B-2");
  assert(a11?.quantity === 3 && b2?.quantity === 2, `after transfer: A-1-1=3,B-2=2 got ${a11?.quantity}/${b2?.quantity}`);
  assert(placement.placed === 5, "transfer does not change total placed");
  const si2 = (await db.stockItem.findUnique({ where: { partId }, select: { quantity: true } })) as { quantity: number };
  assert(si2.quantity === 30, "transfer does not change aggregate on-hand");
  console.log("  ✓ transferStock moves qty between bins, aggregate unchanged, audited TRANSFER");

  // transfer to same location rejected.
  let sameThrew = false;
  try {
    await transferStock(db, { itemId: partId, from: "A-1-1", to: "a-1-1", qty: 1, tenantKey: TENANT });
  } catch (e) {
    sameThrew = e instanceof WmsError && e.code === "SAME_LOCATION";
  }
  assert(sameThrew, "transfer from==to must throw SAME_LOCATION");
  console.log("  ✓ transferStock rejects from == to");

  // remove beyond bin qty rejected (no audit row written).
  const remBefore = await db.stockBinMovement.count({ where: { item: { partId }, reason: "REMOVE" } });
  let remOverThrew = false;
  try {
    await removeFromBin(db, { itemId: partId, location: "B-2", qty: 100, tenantKey: TENANT });
  } catch (e) {
    remOverThrew = e instanceof WmsError && e.code === "INSUFFICIENT_BIN";
  }
  const remAfter = await db.stockBinMovement.count({ where: { item: { partId }, reason: "REMOVE" } });
  assert(remOverThrew, "remove beyond bin qty must throw INSUFFICIENT_BIN");
  assert(remAfter === remBefore, "rejected remove must NOT write a REMOVE audit row (no clamp/audit divergence)");
  console.log("  ✓ removeFromBin rejects qty > bin and writes no audit on rejection");

  // remove back to unplaced.
  await removeFromBin(db, { itemId: partId, location: "B-2", qty: 2, tenantKey: TENANT });
  placement = await binsForItem(db, partId, TENANT);
  assert(placement.placed === 3, `after remove placed 3, got ${placement.placed}`);
  console.log("  ✓ removeFromBin returns qty to unplaced, audited REMOVE");

  // itemsInLocation lists what's stored in a location.
  const inA = await itemsInLocation(db, "A-1-1", TENANT);
  assert(inA.some((r) => r.itemId === partId && r.quantity === 3), "itemsInLocation lists the part in A-1-1 with qty 3");
  console.log("  ✓ itemsInLocation lists items stored in a location");

  // reconcileNeeded when Σbins > on-hand (Phase-1 drift via aggregate CONSUMPTION).
  await recordMovement(db, {
    item: { itemId: partId },
    reason: "CONSUMPTION",
    qty: 28,
    source: { type: "VerifyWh", id: "consume-1" },
    tenantKey: TENANT,
  });
  placement = await binsForItem(db, partId, TENANT);
  assert(placement.reconcileNeeded === true, "Σbins > on-hand must flag reconcileNeeded");
  assert(placement.unplaced === 0, "unplaced clamps at 0 when over-placed");
  console.log("  ✓ reconcileNeeded flags when Σbins exceeds on-hand (drift), unplaced clamps at 0");

  // --- Receiving (приёмка) core: applyReceive + computeReceivingStatus (Phase 2) ---

  // computeReceivingStatus is pure: partial vs full vs terminal-no-downgrade.
  assert(
    computeReceivingStatus([{ quantity: 5, receivedQuantity: 0 }], "ORDERED") === "ORDERED",
    "no receipts yet → status unchanged",
  );
  assert(
    computeReceivingStatus([{ quantity: 5, receivedQuantity: 2 }], "ORDERED") === "PARTIALLY_RECEIVED",
    "some received, not all full → PARTIALLY_RECEIVED",
  );
  assert(
    computeReceivingStatus(
      [{ quantity: 5, receivedQuantity: 5 }, { quantity: 2, receivedQuantity: 3 }],
      "PARTIALLY_RECEIVED",
    ) === "RECEIVED",
    "all PART lines received-in-full → RECEIVED",
  );
  assert(
    computeReceivingStatus([{ quantity: 5, receivedQuantity: 1 }], "COMPLETED") === "COMPLETED",
    "terminal COMPLETED is never auto-downgraded",
  );
  assert(
    computeReceivingStatus([{ quantity: 5, receivedQuantity: 5 }], "CANCELLED") === "CANCELLED",
    "terminal CANCELLED is never auto-touched",
  );
  console.log("  ✓ computeReceivingStatus: partial/full/terminal transitions");

  // Throwaway parts + a supplier order with PART lines.
  const rPart = (await db.part.create({
    data: {
      slug: "verify-wh-recv-1",
      article: "VERIFY-WH-RECV-1",
      name: "verify-warehouse receive part",
      price: 100,
      stockItem: { create: { quantity: 0, tenantKey: TENANT } },
    },
    select: { id: true },
  })) as { id: string };
  const rPart2 = (await db.part.create({
    data: {
      slug: "verify-wh-recv-2",
      article: "VERIFY-WH-RECV-2",
      name: "verify-warehouse receive part 2",
      price: 100,
      stockItem: { create: { quantity: 0, tenantKey: TENANT } },
    },
    select: { id: true },
  })) as { id: string };

  const order = (await db.supplierOrder.create({
    data: {
      userId: admin.id,
      orderNumber: "VERIFY-WH-ORDER-1",
      orderDate: new Date(),
      status: "ORDERED",
      items: {
        create: [
          { type: "PART", partId: rPart.id, description: "recv line 1", quantity: 5, unitCost: 100, totalCost: 500 },
          { type: "PART", partId: rPart2.id, description: "recv line 2", quantity: 2, unitCost: 100, totalCost: 200 },
          { type: "CUSTOM", description: "non-part fee", quantity: 1, unitCost: 50, totalCost: 50 },
        ],
      },
    },
    select: { id: true },
  })) as { id: string };
  const oLines = (await db.supplierOrderItem.findMany({
    where: { orderId: order.id },
    select: { id: true, type: true, partId: true },
    orderBy: { totalCost: "desc" },
  })) as Array<{ id: string; type: string; partId: string | null }>;
  const line1 = oLines.find((l) => l.partId === rPart.id)!;
  const line2 = oLines.find((l) => l.partId === rPart2.id)!;
  const customLine = oLines.find((l) => l.type === "CUSTOM")!;

  // 1) incremental receive: qty 3 against expected 0 → RECEIPT +3, on-hand 3, PARTIALLY_RECEIVED.
  const rec1 = await db.$transaction((tx) =>
    applyReceive(tx, { orderId: order.id, lineId: line1.id, qty: 3, expectedReceived: 0, actorId: admin.id }),
  );
  assert(rec1.error === null && rec1.received === 3 && rec1.overReceived === false, "receive 3 → received 3, not over");
  assert(rec1.status === "PARTIALLY_RECEIVED", `expected PARTIALLY_RECEIVED, got ${rec1.status}`);
  const onHand1 = (await db.stockItem.findUnique({ where: { partId: rPart.id }, select: { quantity: true } })) as { quantity: number };
  assert(onHand1.quantity === 3, `expected on-hand 3, got ${onHand1.quantity}`);
  const receiptCount1 = await db.stockMovement.count({ where: { item: { partId: rPart.id }, reason: "RECEIPT" } });
  assert(receiptCount1 === 1, `expected 1 RECEIPT, got ${receiptCount1}`);
  console.log("  ✓ applyReceive: incremental RECEIPT raises on-hand, status → PARTIALLY_RECEIVED");

  // 2) replay/stale: same expected 0 again → fail closed, no second RECEIPT, no change.
  const rec2 = await db.$transaction((tx) =>
    applyReceive(tx, { orderId: order.id, lineId: line1.id, qty: 3, expectedReceived: 0, actorId: admin.id }),
  );
  assert(rec2.stale === true && rec2.error !== null, "replayed submit (stale expectedReceived) fails closed");
  const onHand2 = (await db.stockItem.findUnique({ where: { partId: rPart.id }, select: { quantity: true } })) as { quantity: number };
  const receiptCount2 = await db.stockMovement.count({ where: { item: { partId: rPart.id }, reason: "RECEIPT" } });
  assert(onHand2.quantity === 3 && receiptCount2 === 1, "stale replay writes no RECEIPT and leaves on-hand unchanged");
  console.log("  ✓ applyReceive: stale/replayed submit fails closed (no double-count)");

  // 3) non-PART line (order still non-terminal) → structured error, nothing written.
  const customReceiptsBefore = await db.stockMovement.count({ where: { reason: "RECEIPT", sourceId: { startsWith: `${order.id}:${customLine.id}` } } });
  const rec3 = await db.$transaction((tx) =>
    applyReceive(tx, { orderId: order.id, lineId: customLine.id, qty: 1, expectedReceived: 0, actorId: admin.id }),
  );
  assert(rec3.error !== null && rec3.stale !== true, "non-PART line receive returns a structured error");
  const customReceiptsAfter = await db.stockMovement.count({ where: { reason: "RECEIPT", sourceId: { startsWith: `${order.id}:${customLine.id}` } } });
  assert(customReceiptsAfter === customReceiptsBefore, "non-PART rejection writes no RECEIPT");
  console.log("  ✓ applyReceive: non-PART line returns structured error, writes nothing");

  // 4) over-receipt WHILE NON-TERMINAL: line1 qty 4 (expected 3) → received 7 (> ordered 5),
  //    overReceived true, on-hand 7; order stays PARTIALLY_RECEIVED (line2 still open).
  const rec4 = await db.$transaction((tx) =>
    applyReceive(tx, { orderId: order.id, lineId: line1.id, qty: 4, expectedReceived: 3, actorId: admin.id }),
  );
  assert(rec4.received === 7 && rec4.overReceived === true, "over-receipt accepted and flagged (received 7 > ordered 5)");
  assert(rec4.status === "PARTIALLY_RECEIVED", `over-receipt with line2 open → PARTIALLY_RECEIVED, got ${rec4.status}`);
  const onHand7 = (await db.stockItem.findUnique({ where: { partId: rPart.id }, select: { quantity: true } })) as { quantity: number };
  assert(onHand7.quantity === 7, `over-receipt raises on-hand to 7, got ${onHand7.quantity}`);
  console.log("  ✓ applyReceive: over-receipt allowed while non-terminal (received > ordered)");

  // 5) complete the order WITH putaway: line2 qty 2 + location → line2 full, ALL lines full →
  //    RECEIVED + receivedAt, and the received delta is placed into bin R-1-1.
  const rec5 = await db.$transaction((tx) =>
    applyReceive(tx, { orderId: order.id, lineId: line2.id, qty: 2, expectedReceived: 0, location: "r-1-1", actorId: admin.id }),
  );
  assert(rec5.error === null && rec5.status === "RECEIVED", `final line full → RECEIVED, got ${rec5.status}`);
  const ord = (await db.supplierOrder.findUnique({ where: { id: order.id }, select: { status: true, receivedAt: true } })) as { status: string; receivedAt: Date | null };
  assert(ord.status === "RECEIVED" && ord.receivedAt !== null, "order auto-RECEIVED with receivedAt stamped");
  const place = await binsForItem(db, rPart2.id, TENANT);
  assert(place.bins.some((b) => b.location === "R-1-1" && b.quantity === 2), "received qty placed into bin R-1-1 (putaway)");
  console.log("  ✓ applyReceive: completing receive with location → RECEIVED + putaway into bin");

  // 6) TERMINAL GUARD: the order is now RECEIVED — a further receive (e.g. stale UI or direct
  //    action call) must be rejected server-side, writing no RECEIPT and leaving on-hand unchanged.
  const termReceiptsBefore = await db.stockMovement.count({ where: { item: { partId: rPart.id }, reason: "RECEIPT" } });
  const rec6 = await db.$transaction((tx) =>
    applyReceive(tx, { orderId: order.id, lineId: line1.id, qty: 1, expectedReceived: 7, actorId: admin.id }),
  );
  assert(rec6.error !== null && rec6.stale !== true, "receiving on a terminal (RECEIVED) order is rejected");
  const termReceiptsAfter = await db.stockMovement.count({ where: { item: { partId: rPart.id }, reason: "RECEIPT" } });
  const onHandTerm = (await db.stockItem.findUnique({ where: { partId: rPart.id }, select: { quantity: true } })) as { quantity: number };
  assert(termReceiptsAfter === termReceiptsBefore && onHandTerm.quantity === 7, "terminal-order receive writes no RECEIPT and leaves on-hand unchanged");
  console.log("  ✓ applyReceive: terminal order is closed for receiving (no stock raised)");

  // 7) Manual-status guard (regression for bulk-flip removal): the receiving statuses are
  //    auto-only, so updateSupplierOrderStatus rejects them and never fires a RECEIPT.
  assert(isReceivingStatus("RECEIVED") && isReceivingStatus("PARTIALLY_RECEIVED"), "auto-only statuses are receiving statuses");
  assert(!isReceivingStatus("IN_TRANSIT") && !isReceivingStatus("COMPLETED") && !isReceivingStatus("CANCELLED"), "manual statuses are not receiving statuses");
  console.log("  ✓ isReceivingStatus: RECEIVED/PARTIALLY_RECEIVED are auto-only (manual flip rejected, no RECEIPT)");

  // Receiving cleanup (order + its items).
  await db.supplierOrder.deleteMany({ where: { orderNumber: { startsWith: "VERIFY-WH-ORDER-" } } });

  // Cleanup (cascade removes StockItem + movements + bins).
  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-WH-" } } });
  console.log("[verify-warehouse] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-warehouse] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
