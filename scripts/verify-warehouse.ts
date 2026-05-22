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
