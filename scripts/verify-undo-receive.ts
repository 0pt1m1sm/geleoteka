/**
 * DB-backed verification of сторно приёмки (Story 4, plan 2026-07-11) against
 * the dev Postgres: applyReceive → applyUndoReceive round-trips on a throwaway
 * part, including the C1 regression (re-receive to a previously-seen count)
 * and the full-undo status downgrade. Mirrors verify-warehouse.ts conventions:
 * plain asserts, exit 1 on failure, cascade cleanup.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { TENANT_KEY, defaultWarehouseId } from "../lib/wms-host";
import { applyReceive, applyUndoReceive } from "../lib/warehouse/receive";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const MARK = "VRF-UNDO";

async function cleanup(): Promise<void> {
  const parts = (await db.part.findMany({
    where: { article: { startsWith: MARK } },
    select: { id: true },
  })) as Array<{ id: string }>;
  const ids = parts.map((p) => p.id);
  await db.supplierOrder.deleteMany({ where: { orderNumber: { startsWith: MARK } } });
  if (ids.length) {
    await db.stockBinMovement.deleteMany({ where: { item: { partId: { in: ids } } } });
    await db.stockBin.deleteMany({ where: { item: { partId: { in: ids } } } });
    await db.stockMovement.deleteMany({ where: { item: { partId: { in: ids } } } });
    await db.stockItem.deleteMany({ where: { partId: { in: ids } } });
    await db.part.deleteMany({ where: { id: { in: ids } } });
  }
  await db.user.deleteMany({ where: { email: "vrf-undo-supplier@test.local" } });
}

async function main(): Promise<void> {
  console.log("[verify-undo-receive] starting");
  await cleanup();
  const warehouseId = await defaultWarehouseId(db);

  const supplier = (await db.user.create({
    data: {
      email: "vrf-undo-supplier@test.local",
      phone: "+79990000044",
      name: "VRF Поставщик",
      permissionRole: "NONE",
      isSupplier: true,
    },
    select: { id: true },
  })) as { id: string };

  const part = (await db.part.create({
    data: { slug: "vrf-undo-part", article: `${MARK}-001`, name: "VRF undo part", price: 1, isActive: true },
    select: { id: true },
  })) as { id: string };
  await db.stockItem.create({ data: { partId: part.id, tenantKey: TENANT_KEY, warehouseId } });

  const order = (await db.supplierOrder.create({
    data: {
      userId: supplier.id,
      orderNumber: `${MARK}-1`,
      orderDate: new Date(),
      status: "ORDERED",
      items: { create: [{ type: "PART", partId: part.id, description: "VRF undo part", quantity: 3, unitCost: 1, totalCost: 3 }] },
    },
    select: { id: true, items: { select: { id: true } } },
  })) as { id: string; items: Array<{ id: string }> };
  const lineId = order.items[0].id;

  const onHand = async (): Promise<{ quantity: number; reserved: number }> =>
    (await db.stockItem.findUnique({
      where: { partId_warehouseId: { partId: part.id, warehouseId } },
      select: { quantity: true, reserved: true },
    })) as { quantity: number; reserved: number };
  const binQty = async (): Promise<number> => {
    const agg = (await db.stockBin.aggregate({
      where: { tenantKey: TENANT_KEY, item: { partId: part.id } , location: "ПРИЁМКА" },
      _sum: { quantity: true },
    })) as { _sum: { quantity: number | null } };
    return agg._sum.quantity ?? 0;
  };
  const orderRow = async (): Promise<{ status: string; receivedAt: Date | null }> =>
    (await db.supplierOrder.findUnique({ where: { id: order.id }, select: { status: true, receivedAt: true } })) as {
      status: string;
      receivedAt: Date | null;
    };

  // 1) receive 3 into ПРИЁМКА → RECEIVED
  const rec = await db.$transaction((tx) =>
    applyReceive(tx, { orderId: order.id, lineId, qty: 3, expectedReceived: 0, location: "ПРИЁМКА", warehouseId }),
  );
  assert(rec.error === null && rec.status === "RECEIVED", "receive 3 completes the order");
  assert((await onHand()).quantity === 3 && (await binQty()) === 3, "on-hand=bin=3 after receive");
  console.log("  ✓ receive 3 → RECEIVED, ПРИЁМКА=3");

  // 2) undo 1 → PARTIALLY_RECEIVED, receivedAt cleared, stock/bin −1
  const undo1 = await db.$transaction((tx) =>
    applyUndoReceive(tx, { orderId: order.id, lineId, qty: 1, expectedReceived: 3, location: "ПРИЁМКА", warehouseId }),
  );
  assert(undo1.error === null && undo1.received === 2 && undo1.status === "PARTIALLY_RECEIVED", "undo 1 → partial");
  const o1 = await orderRow();
  assert(o1.status === "PARTIALLY_RECEIVED" && o1.receivedAt === null, "status downgraded + receivedAt cleared");
  assert((await onHand()).quantity === 2 && (await binQty()) === 2, "on-hand=bin=2 after undo 1");
  console.log("  ✓ undo 1 → PARTIALLY_RECEIVED, receivedAt cleared, stock/bin consistent");

  // 3) C1 regression on real Postgres: re-receive back to the previously-seen count 3
  const rerec = await db.$transaction((tx) =>
    applyReceive(tx, { orderId: order.id, lineId, qty: 1, expectedReceived: 2, location: "ПРИЁМКА", warehouseId }),
  );
  assert(rerec.error === null && rerec.received === 3, "re-receive to 3 applies");
  assert((await onHand()).quantity === 3 && (await binQty()) === 3, "C1: on-hand raised on re-receive (no silent source collision)");
  console.log("  ✓ C1: receive→undo→re-receive to a seen count stays consistent on real PG");

  // 4) stale undo token fails closed
  const stale = await db.$transaction((tx) =>
    applyUndoReceive(tx, { orderId: order.id, lineId, qty: 1, expectedReceived: 2, location: "ПРИЁМКА", warehouseId }),
  );
  assert(stale.stale === true && (await onHand()).quantity === 3, "stale undo fails closed");
  console.log("  ✓ stale undo token fails closed");

  // 5) full undo → ORDERED, stock zeroed; reversal movements audited
  const undoAll = await db.$transaction((tx) =>
    applyUndoReceive(tx, { orderId: order.id, lineId, qty: 3, expectedReceived: 3, location: "ПРИЁМКА", warehouseId }),
  );
  assert(undoAll.error === null && undoAll.received === 0 && undoAll.status === "ORDERED", "full undo → ORDERED");
  assert((await onHand()).quantity === 0 && (await binQty()) === 0, "stock zeroed after full undo");
  const reversals = await db.stockMovement.count({ where: { reason: "RECEIPT_REVERSAL", item: { partId: part.id } } });
  assert(reversals === 2, "two RECEIPT_REVERSAL rows audited");
  console.log("  ✓ full undo → ORDERED, ledger has 2 reversals");

  await cleanup();
  console.log("[verify-undo-receive] PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
