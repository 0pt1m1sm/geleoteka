/**
 * Verifies the scanner receiving core (lib/warehouse/scan-receive.ts) against the
 * dev DB:
 *  - applyScanReceiveOrderLine: raises on-hand, places into ПРИЁМКА, advances the
 *    order line/status (reuses applyReceive); rejects a non-open (DRAFT) order.
 *  - applyBlindReceive: raises on-hand into ПРИЁМКА via a RECEIPT/ManualReceipt
 *    movement; a replay with the same idempotencyKey is a no-op (no double place).
 *  - blocked-location guard: receiving into a blocked cell throws LOCATION_BLOCKED
 *    and raises no stock.
 *  - openOrderLinesForPart: returns only open, not-fully-received PART lines.
 *
 * Fixtures use VERIFY-SR- prefixes so cleanup is a cascade delete.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { WmsError, setLocationBlocked } from "../lib/wms/public";
import { STAGING_LOCATION, TENANT_KEY } from "../lib/wms-host";
import {
  applyScanReceiveOrderLine,
  applyBlindReceive,
  openOrderLinesForPart,
} from "../lib/warehouse/scan-receive";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function onHand(partId: string): Promise<number> {
  const si = (await db.stockItem.findUnique({
    where: { partId },
    select: { quantity: true },
  })) as { quantity: number } | null;
  return si?.quantity ?? 0;
}

async function binQty(partId: string, location: string): Promise<number> {
  const bin = (await db.stockBin.findFirst({
    where: { item: { partId }, location, tenantKey: TENANT_KEY },
    select: { quantity: true },
  })) as { quantity: number } | null;
  return bin?.quantity ?? 0;
}

async function cleanup(): Promise<void> {
  await db.supplierOrder.deleteMany({ where: { orderNumber: { startsWith: "VERIFY-SR-" } } });
  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-SR-" } } });
}

async function makePart(suffix: string): Promise<string> {
  const p = (await db.part.create({
    data: {
      slug: `verify-sr-${suffix}`,
      article: `VERIFY-SR-${suffix}`,
      name: `verify scan-receive ${suffix}`,
      price: 100,
      stockItem: { create: { quantity: 0, tenantKey: TENANT_KEY } },
    },
    select: { id: true },
  })) as { id: string };
  return p.id;
}

async function makeOrderLine(
  supplierUserId: string,
  partId: string,
  status: string,
  qty: number,
  num: string,
): Promise<{ orderId: string; lineId: string }> {
  const createOrder = db.supplierOrder.create as unknown as (args: unknown) => Promise<{ id: string; items: Array<{ id: string }> }>;
  const order = await createOrder({
    data: {
      userId: supplierUserId,
      orderNumber: `VERIFY-SR-${num}`,
      orderDate: new Date(),
      status,
      items: {
        create: [{ type: "PART", partId, description: "verify line", quantity: qty, unitCost: 100, totalCost: 100 * qty }],
      },
    },
    select: { id: true, items: { select: { id: true } } },
  });
  return { orderId: order.id, lineId: order.items[0].id };
}

async function main(): Promise<void> {
  console.log("[verify-scan-receiving] starting");
  await cleanup();

  const admin = (await db.user.findFirst({
    where: { email: "admin@geleoteka.ru" },
    select: { id: true },
  })) as { id: string } | null;
  assert(admin, "seed admin@geleoteka.ru not found");

  // --- order-backed receive into ПРИЁМКА ---
  const p1 = await makePart("0001");
  const { orderId, lineId } = await makeOrderLine(admin.id, p1, "ORDERED", 2, "0001");
  const r1 = await db.$transaction((tx) =>
    applyScanReceiveOrderLine(tx, { orderId, lineId, qty: 2, expectedReceived: 0, location: STAGING_LOCATION, actorId: admin.id }),
  );
  assert(r1.error === null, `order receive should succeed, got error: ${r1.error}`);
  assert(r1.received === 2, `expected received 2, got ${r1.received}`);
  assert(r1.status === "RECEIVED", `expected order RECEIVED, got ${r1.status}`);
  assert((await onHand(p1)) === 2, "order receive should raise on-hand to 2");
  assert((await binQty(p1, STAGING_LOCATION)) === 2, "order receive should place 2 into ПРИЁМКА");
  console.log("  ✓ order-backed receive raises on-hand, places into ПРИЁМКА, closes order");

  // openOrderLinesForPart: now fully received → no open lines
  assert((await openOrderLinesForPart(db, p1)).length === 0, "fully-received line must not be returned as open");

  // --- DRAFT rejection ---
  const p2 = await makePart("0002");
  const draft = await makeOrderLine(admin.id, p2, "DRAFT", 5, "0002");
  const rDraft = await db.$transaction((tx) =>
    applyScanReceiveOrderLine(tx, { orderId: draft.orderId, lineId: draft.lineId, qty: 1, expectedReceived: 0, location: STAGING_LOCATION, actorId: admin.id }),
  );
  assert(rDraft.error !== null, "receiving a DRAFT order must be rejected");
  assert((await onHand(p2)) === 0, "rejected DRAFT receive must not raise stock");
  console.log("  ✓ DRAFT (non-open) order receive rejected, no stock raised");

  // openOrderLinesForPart: DRAFT is not open → not returned; an ORDERED line is
  const open2 = await makeOrderLine(admin.id, p2, "ORDERED", 4, "0002B");
  const lines2 = await openOrderLinesForPart(db, p2);
  assert(lines2.length === 1 && lines2[0].lineId === open2.lineId, "only the open ORDERED line should be returned");
  assert(lines2[0].remaining === 4, `expected remaining 4, got ${lines2[0].remaining}`);
  console.log("  ✓ openOrderLinesForPart returns only open, not-fully-received lines");

  // --- blind receive + idempotent replay ---
  const p3 = await makePart("0003");
  const b1 = await db.$transaction((tx) =>
    applyBlindReceive(tx, { partId: p3, qty: 3, location: STAGING_LOCATION, idempotencyKey: "VERIFY-SR-K1", actorId: admin.id }),
  );
  assert(b1.applied === true && b1.quantity === 3, `blind receive should apply +3, got applied=${b1.applied} qty=${b1.quantity}`);
  assert((await binQty(p3, STAGING_LOCATION)) === 3, "blind receive should place 3 into ПРИЁМКА");
  const mv = (await db.stockMovement.findFirst({
    where: { item: { partId: p3 }, reason: "RECEIPT", sourceType: "ManualReceipt" },
    select: { id: true },
  })) as { id: string } | null;
  assert(mv, "blind receive must write a RECEIPT/ManualReceipt movement");
  // replay with same key → no-op, no double place
  const b2 = await db.$transaction((tx) =>
    applyBlindReceive(tx, { partId: p3, qty: 3, location: STAGING_LOCATION, idempotencyKey: "VERIFY-SR-K1", actorId: admin.id }),
  );
  assert(b2.applied === false, "blind receive replay (same key) must be a no-op");
  assert((await onHand(p3)) === 3, "blind receive replay must not double on-hand");
  assert((await binQty(p3, STAGING_LOCATION)) === 3, "blind receive replay must not double placement");
  console.log("  ✓ blind receive raises on-hand into ПРИЁМКА; replay with same key is a no-op");

  // --- blocked-location guard ---
  await setLocationBlocked(db, "VERIFY-SR-BLK", TENANT_KEY, { isActive: true, isBlocked: true });
  const p4 = await makePart("0004");
  let blocked = false;
  try {
    await db.$transaction((tx) =>
      applyBlindReceive(tx, { partId: p4, qty: 1, location: "VERIFY-SR-BLK", idempotencyKey: "VERIFY-SR-K2", actorId: admin.id }),
    );
  } catch (e) {
    blocked = e instanceof WmsError && e.code === "LOCATION_BLOCKED";
  }
  assert(blocked, "receiving into a blocked location must throw LOCATION_BLOCKED");
  assert((await onHand(p4)) === 0, "blocked-location receive must not raise stock");
  console.log("  ✓ receiving into a blocked location is rejected, no stock raised");

  // --- blank/whitespace location coerces to ПРИЁМКА (not unplaced / empty bin) ---
  const p5 = await makePart("0005");
  const b5 = await db.$transaction((tx) =>
    applyBlindReceive(tx, { partId: p5, qty: 2, location: "   ", idempotencyKey: "VERIFY-SR-K5", actorId: admin.id }),
  );
  assert(b5.applied === true && b5.quantity === 2, "blank-location blind receive should apply +2");
  assert((await binQty(p5, STAGING_LOCATION)) === 2, "blank location must coerce to ПРИЁМКА (goods placed there)");
  assert((await binQty(p5, "")) === 0, "blank location must NOT place into an empty-string bin");
  console.log("  ✓ blank/whitespace location coerces to ПРИЁМКА (goods not left unplaced)");

  // cleanup
  await db.supplierOrder.deleteMany({ where: { orderNumber: { startsWith: "VERIFY-SR-" } } });
  await db.part.deleteMany({ where: { article: { startsWith: "VERIFY-SR-" } } });
  await db.stockLocation.deleteMany({ where: { code: "VERIFY-SR-BLK", tenantKey: TENANT_KEY } });

  console.log("[verify-scan-receiving] PASS");
}

main()
  .catch((err) => {
    console.error("[verify-scan-receiving] ERROR", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
