import { describe, expect, it } from "vitest";
import type { DbClientPort } from "@/lib/wms/public";
import {
  applyBlindReceive,
  applyScanReceiveOrderLine,
  openOrderLinesForPart,
} from "@/lib/warehouse/scan-receive";
import { STAGING_LOCATION } from "@/lib/wms-host";
import { FakeDb, makeReceivingFixture } from "../helpers/fake-db";

const TENANT = "geleoteka";
const WH = "wh_main";

function asClient(db: unknown): DbClientPort {
  return db as DbClientPort;
}

describe("applyScanReceiveOrderLine", () => {
  it("stages into ПРИЁМКА when the cell is blank/whitespace", async () => {
    const { db, order, line, stockItem } = makeReceivingFixture({ quantity: 5 });
    const res = await applyScanReceiveOrderLine(asClient(db), {
      orderId: order.id,
      lineId: line.id,
      qty: 2,
      expectedReceived: 0,
      location: "   ",
      warehouseId: WH,
    });
    expect(res.error).toBeNull();
    expect(stockItem.quantity).toBe(2);
    expect(db.binQty(stockItem.id, STAGING_LOCATION)).toBe(2);
    // The staging location was auto-registered active+unblocked.
    expect(db.locations).toContainEqual(expect.objectContaining({ code: STAGING_LOCATION, isActive: true, isBlocked: false }));
  });

  it("honors an explicit cell", async () => {
    const { db, order, line, stockItem } = makeReceivingFixture({ quantity: 5 });
    const res = await applyScanReceiveOrderLine(asClient(db), {
      orderId: order.id,
      lineId: line.id,
      qty: 2,
      expectedReceived: 0,
      location: "b-2-2", // normalized upper by placeStock
      warehouseId: WH,
    });
    expect(res.error).toBeNull();
    expect(db.binQty(stockItem.id, "B-2-2")).toBe(2);
  });

  it.each(["ORDERED", "IN_TRANSIT", "CUSTOMS", "PARTIALLY_RECEIVED"])(
    "accepts a %s order — every OPEN status stays receivable",
    async (status) => {
      const { db, order, line, stockItem } = makeReceivingFixture({ orderStatus: status, quantity: 5, received: 1 });
      const res = await applyScanReceiveOrderLine(asClient(db), {
        orderId: order.id,
        lineId: line.id,
        qty: 1,
        expectedReceived: 1,
        location: "",
        warehouseId: WH,
      });
      expect(res.error).toBeNull();
      expect(stockItem.quantity).toBe(1);
    },
  );

  it.each(["DRAFT", "RECEIVED", "COMPLETED", "CANCELLED"])(
    "rejects a %s order server-side before any stock change",
    async (status) => {
      const { db, order, line, stockItem } = makeReceivingFixture({ orderStatus: status });
      const res = await applyScanReceiveOrderLine(asClient(db), {
        orderId: order.id,
        lineId: line.id,
        qty: 1,
        expectedReceived: 0,
        location: "",
        warehouseId: WH,
      });
      expect(res.error).toBe("Заказ недоступен для приёмки");
      expect(stockItem.quantity).toBe(0);
      expect(line.receivedQuantity).toBe(0);
      expect(db.movements).toHaveLength(0);
    },
  );

  it("rejects a blocked target cell before any stock change", async () => {
    const { db, order, line, stockItem } = makeReceivingFixture();
    db.seedLocation({ code: "BAD-1", warehouseId: WH, tenantKey: TENANT, isBlocked: true });
    await expect(
      applyScanReceiveOrderLine(asClient(db), {
        orderId: order.id,
        lineId: line.id,
        qty: 1,
        expectedReceived: 0,
        location: "BAD-1",
        warehouseId: WH,
      }),
    ).rejects.toMatchObject({ code: "LOCATION_BLOCKED" });
    expect(stockItem.quantity).toBe(0);
    expect(line.receivedQuantity).toBe(0);
  });
});

describe("applyBlindReceive", () => {
  it("raises on-hand under a ManualReceipt source and places into the staging cell", async () => {
    const db = new FakeDb();
    const si = db.seedStockItem({ partId: "part_1", warehouseId: WH, tenantKey: TENANT });
    const res = await applyBlindReceive(asClient(db), {
      partId: "part_1",
      qty: 4,
      location: "",
      idempotencyKey: "blind-1",
      warehouseId: WH,
    });
    expect(res).toMatchObject({ applied: true, quantity: 4 });
    expect(db.binQty(si.id, STAGING_LOCATION)).toBe(4);
    expect(db.movementsFor(si.id, "RECEIPT")[0]).toMatchObject({ sourceType: "ManualReceipt", sourceId: "blind-1" });
  });

  it("a replayed idempotencyKey does NOT re-place — bins stay in sync with on-hand", async () => {
    const db = new FakeDb();
    const si = db.seedStockItem({ partId: "part_1", warehouseId: WH, tenantKey: TENANT });
    const input = { partId: "part_1", qty: 4, location: "", idempotencyKey: "blind-1", warehouseId: WH };

    const first = await applyBlindReceive(asClient(db), input);
    expect(first.applied).toBe(true);

    const replay = await applyBlindReceive(asClient(db), { ...input });
    expect(replay.applied).toBe(false);
    // The invariant the guard exists for: no second placement on replay.
    expect(si.quantity).toBe(4);
    expect(db.binQty(si.id, STAGING_LOCATION)).toBe(4);
    expect(db.binMovements).toHaveLength(1);
  });

  it("rejects a blocked target cell before any stock change (blind path has no other gate)", async () => {
    const db = new FakeDb();
    const si = db.seedStockItem({ partId: "part_1", warehouseId: WH, tenantKey: TENANT });
    db.seedLocation({ code: "BAD-1", warehouseId: WH, tenantKey: TENANT, isBlocked: true });
    await expect(
      applyBlindReceive(asClient(db), { partId: "part_1", qty: 1, location: "BAD-1", idempotencyKey: "b1", warehouseId: WH }),
    ).rejects.toMatchObject({ code: "LOCATION_BLOCKED" });
    expect(si.quantity).toBe(0);
    expect(db.movements).toHaveLength(0);
    expect(db.bins).toHaveLength(0);
  });

  it("normalizes a lowercase Cyrillic cell code to its upper-case bin (приёмка → ПРИЁМКА)", async () => {
    const db = new FakeDb();
    const si = db.seedStockItem({ partId: "part_1", warehouseId: WH, tenantKey: TENANT });
    const res = await applyBlindReceive(asClient(db), {
      partId: "part_1",
      qty: 2,
      location: "приёмка",
      idempotencyKey: "cyr-1",
      warehouseId: WH,
    });
    expect(res.applied).toBe(true);
    expect(db.binQty(si.id, "ПРИЁМКА")).toBe(2);
    expect(db.bins).toHaveLength(1); // no second lowercase bin
  });
});

describe("openOrderLinesForPart", () => {
  it("filters by part, PART type and open order status via the WHERE it actually sends", async () => {
    const db = new FakeDb();
    db.seedStockItem({ partId: "part_1", warehouseId: WH, tenantKey: TENANT });
    const open = db.seedOrder({ status: "ORDERED" });
    const full = db.seedOrder({ status: "ORDERED" });
    const draft = db.seedOrder({ status: "DRAFT" });
    db.seedLine({ orderId: open.id, partId: "part_1", quantity: 5, receivedQuantity: 2 });
    db.seedLine({ orderId: full.id, partId: "part_1", quantity: 3, receivedQuantity: 3 }); // fully received
    db.seedLine({ orderId: draft.id, partId: "part_1", quantity: 4, receivedQuantity: 0 }); // DRAFT order — must be excluded by the status filter
    db.seedLine({ orderId: open.id, partId: "part_1", quantity: 1, receivedQuantity: 0, type: "CUSTOM" }); // wrong type — excluded by the type filter
    db.seedLine({ orderId: open.id, partId: "part_2", quantity: 9, receivedQuantity: 0 }); // other part — excluded by the partId filter

    // Arg-driven stub: applies the WHERE the production code actually sends, so a
    // dropped partId/type/status filter surfaces as extra rows and fails the test.
    const client = {
      ...db,
      supplierOrderItem: {
        findMany: async (args: {
          where: { partId?: string; type?: string; order?: { status?: { in?: string[] } } };
        }) => {
          const w = args.where ?? {};
          return db.supplierOrderItems
            .filter((l) => {
              const o = db.supplierOrders.find((x) => x.id === l.orderId);
              if (!o) return false;
              if (w.partId !== undefined && l.partId !== w.partId) return false;
              if (w.type !== undefined && l.type !== w.type) return false;
              if (w.order?.status?.in !== undefined && !w.order.status.in.includes(o.status)) return false;
              return true;
            })
            .map((l) => ({
              id: l.id,
              orderId: l.orderId,
              quantity: l.quantity,
              receivedQuantity: l.receivedQuantity,
              order: { orderNumber: null, supplier: { name: "Тест" } },
            }));
        },
      },
    };

    const rows = await openOrderLinesForPart(asClient(client), "part_1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderId: open.id, ordered: 5, received: 2, remaining: 3 });
  });
});
