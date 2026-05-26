/**
 * Verifies the stock invariant placed ≤ on-hand is structurally enforced:
 * applyAdjustment must REJECT lowering on-hand below what is physically placed
 * in bins (the documented drift hole — adjust changes the aggregate without
 * touching bins). Adjust-up and adjust-down-to-placed stay allowed.
 *
 * Runs on a throwaway Part so cleanup is a single cascade delete.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { placeStock, binsForItem } from "../lib/wms/public";
import { applyAdjustment } from "../lib/warehouse/adjust";

const TENANT = "geleoteka";
const WH = "wh_main_geleoteka";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function onHandOf(partId: string): Promise<number> {
  const si = (await db.stockItem.findUnique({
    where: { partId_warehouseId: { partId, warehouseId: WH } },
    select: { quantity: true },
  })) as { quantity: number };
  return si.quantity;
}

async function main(): Promise<void> {
  console.log("[verify-stock-invariant] starting");
  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-INV-" } } });

  const part = (await db.part.create({
    data: {
      slug: "verify-inv-part-0001",
      article: "VERIFY-INV-0001",
      name: "verify-invariant part",
      price: 100,
      stockItems: { create: { warehouseId: WH, quantity: 3, tenantKey: TENANT } },
    },
    select: { id: true },
  })) as { id: string };
  const partId = part.id;

  // Place all 3 on a shelf → placed 3, on-hand 3, no drift.
  await placeStock(db, { itemId: partId, warehouseId: WH, location: "INV-1-1", qty: 3, tenantKey: TENANT });
  let placement = await binsForItem(db, partId, WH, TENANT);
  assert(placement.placed === 3 && placement.quantity === 3 && !placement.reconcileNeeded, "precondition: placed 3 / on-hand 3 / no drift");
  console.log("  ✓ precondition: 3 placed, 3 on-hand, no drift");

  // CORE: lower on-hand to 1 (below placed 3) → MUST be rejected, nothing changes.
  const before = await onHandOf(partId);
  let threw = false;
  try {
    await db.$transaction((tx) => applyAdjustment(tx, partId, 1, undefined, "verify-invariant below-placed"));
  } catch {
    threw = true;
  }
  const after = await onHandOf(partId);
  placement = await binsForItem(db, partId, WH, TENANT);
  assert(threw, "adjust below placed (1 < placed 3) must throw");
  assert(after === before && after === 3, `adjust below placed must roll back (on-hand unchanged at 3, got ${after})`);
  assert(!placement.reconcileNeeded, "invariant holds: placed ≤ on-hand, no reconcile drift");
  console.log("  ✓ adjust below placed is rejected; on-hand unchanged; no drift created");

  // adjust DOWN to exactly placed is allowed.
  const r1 = await db.$transaction((tx) => applyAdjustment(tx, partId, 3, undefined, "verify-invariant to-placed"));
  assert(r1.quantity === 3, "adjust to exactly placed is a no-op/allowed");

  // adjust UP is always allowed (placed 3 ≤ new on-hand 9).
  const r2 = await db.$transaction((tx) => applyAdjustment(tx, partId, 9, undefined, "verify-invariant up"));
  assert(r2.quantity === 9, "adjust up above placed is allowed");
  placement = await binsForItem(db, partId, WH, TENANT);
  assert(placement.placed === 3 && placement.unplaced === 6 && !placement.reconcileNeeded, "after adjust-up: placed 3, unplaced 6, no drift");
  console.log("  ✓ adjust-down-to-placed and adjust-up remain allowed");

  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-INV-" } } });
  console.log("[verify-stock-invariant] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-stock-invariant] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
