import { describe, expect, it } from "vitest";
import type { DbClientPort } from "@/lib/wms/public";
import {
  applyReceive,
  computeReceivingStatus,
  isReceivingStatus,
  type SupplierOrderStatus,
} from "@/lib/warehouse/receive";
import { makeReceivingFixture } from "../helpers/fake-db";

function asClient(db: unknown): DbClientPort {
  return db as DbClientPort;
}

describe("isReceivingStatus", () => {
  it("marks exactly the two receiving-owned statuses", () => {
    expect(isReceivingStatus("PARTIALLY_RECEIVED")).toBe(true);
    expect(isReceivingStatus("RECEIVED")).toBe(true);
    expect(isReceivingStatus("ORDERED")).toBe(false);
    expect(isReceivingStatus("COMPLETED")).toBe(false);
  });
});

describe("computeReceivingStatus", () => {
  const line = (quantity: number, receivedQuantity: number) => ({ quantity, receivedQuantity });

  it("keeps the current status while nothing is received", () => {
    expect(computeReceivingStatus([line(5, 0)], "ORDERED")).toBe("ORDERED");
    expect(computeReceivingStatus([line(5, 0)], "CUSTOMS")).toBe("CUSTOMS");
  });

  it("goes PARTIALLY_RECEIVED when some (not all) is received", () => {
    expect(computeReceivingStatus([line(5, 2)], "ORDERED")).toBe("PARTIALLY_RECEIVED");
    expect(computeReceivingStatus([line(5, 5), line(3, 0)], "IN_TRANSIT")).toBe("PARTIALLY_RECEIVED");
  });

  it("goes RECEIVED when every PART line is received in full (over-receive counts as full)", () => {
    expect(computeReceivingStatus([line(5, 5)], "ORDERED")).toBe("RECEIVED");
    expect(computeReceivingStatus([line(5, 7)], "PARTIALLY_RECEIVED")).toBe("RECEIVED");
  });

  it("never touches terminal manual states", () => {
    expect(computeReceivingStatus([line(5, 5)], "COMPLETED")).toBe("COMPLETED");
    expect(computeReceivingStatus([line(5, 1)], "CANCELLED")).toBe("CANCELLED");
  });

  it("keeps the current status for an order with no PART lines", () => {
    expect(computeReceivingStatus([], "ORDERED")).toBe("ORDERED");
  });
});

describe("applyReceive", () => {
  it("raises on-hand, advances receivedQuantity and flips the order to PARTIALLY_RECEIVED", async () => {
    const { db, order, line, stockItem, warehouseId } = makeReceivingFixture({ quantity: 5 });
    const res = await applyReceive(asClient(db), {
      orderId: order.id,
      lineId: line.id,
      qty: 3,
      expectedReceived: 0,
      warehouseId,
    });
    expect(res).toMatchObject({ error: null, received: 3, ordered: 5, overReceived: false, status: "PARTIALLY_RECEIVED" });
    expect(line.receivedQuantity).toBe(3);
    expect(stockItem.quantity).toBe(3);
    expect(order.status).toBe("PARTIALLY_RECEIVED");
    expect(order.receivedAt).toBeNull();
  });

  it("completes the order (RECEIVED + receivedAt) when the last line fills", async () => {
    const { db, order, line, warehouseId } = makeReceivingFixture({ quantity: 5, received: 3, orderStatus: "PARTIALLY_RECEIVED" });
    const res = await applyReceive(asClient(db), {
      orderId: order.id,
      lineId: line.id,
      qty: 2,
      expectedReceived: 3,
      warehouseId,
    });
    expect(res.status).toBe("RECEIVED");
    expect(order.status).toBe("RECEIVED");
    expect(order.receivedAt).toBeInstanceOf(Date);
  });

  it("fails closed on a stale/replayed CAS token — no movement, no counter change", async () => {
    const { db, order, line, stockItem, warehouseId } = makeReceivingFixture({ quantity: 5, received: 3, orderStatus: "PARTIALLY_RECEIVED" });
    const res = await applyReceive(asClient(db), {
      orderId: order.id,
      lineId: line.id,
      qty: 2,
      expectedReceived: 0, // stale: the line is already at 3
      warehouseId,
    });
    expect(res.stale).toBe(true);
    expect(res.error).toBeTruthy();
    expect(line.receivedQuantity).toBe(3);
    expect(stockItem.quantity).toBe(0);
    expect(db.movements).toHaveLength(0);
  });

  it("flags over-receive but applies it", async () => {
    const { db, order, line, stockItem, warehouseId } = makeReceivingFixture({ quantity: 5 });
    const res = await applyReceive(asClient(db), {
      orderId: order.id,
      lineId: line.id,
      qty: 7,
      expectedReceived: 0,
      warehouseId,
    });
    expect(res.overReceived).toBe(true);
    expect(res.status).toBe("RECEIVED");
    expect(line.receivedQuantity).toBe(7);
    expect(stockItem.quantity).toBe(7);
  });

  it.each(["RECEIVED", "COMPLETED", "CANCELLED"] as SupplierOrderStatus[])(
    "refuses to receive on a %s order before touching the line",
    async (status) => {
      const { db, order, line, stockItem, warehouseId } = makeReceivingFixture({ orderStatus: status });
      const res = await applyReceive(asClient(db), {
        orderId: order.id,
        lineId: line.id,
        qty: 1,
        expectedReceived: 0,
        warehouseId,
      });
      expect(res.error).toBe("Заказ закрыт для приёмки");
      expect(line.receivedQuantity).toBe(0);
      expect(stockItem.quantity).toBe(0);
      expect(db.movements).toHaveLength(0);
    },
  );

  it("rejects non-PART lines", async () => {
    const { db, order, warehouseId } = makeReceivingFixture();
    const feeLine = db.seedLine({ orderId: order.id, quantity: 1, type: "FEE", partId: null });
    const res = await applyReceive(asClient(db), {
      orderId: order.id,
      lineId: feeLine.id,
      qty: 1,
      expectedReceived: 0,
      warehouseId,
    });
    expect(res.error).toBe("Можно принимать только запчасти");
  });

  it("rejects a line that belongs to another order", async () => {
    const { db, line, warehouseId } = makeReceivingFixture();
    const other = db.seedOrder({ status: "ORDERED" });
    const res = await applyReceive(asClient(db), {
      orderId: other.id,
      lineId: line.id,
      qty: 1,
      expectedReceived: 0,
      warehouseId,
    });
    expect(res.error).toBe("Позиция не найдена");
  });

  it("puts the received qty into the given bin, atomically with the receipt", async () => {
    const { db, order, line, stockItem, warehouseId } = makeReceivingFixture({ quantity: 5 });
    await applyReceive(asClient(db), {
      orderId: order.id,
      lineId: line.id,
      qty: 3,
      expectedReceived: 0,
      location: "A-1-1",
      warehouseId,
    });
    expect(db.binQty(stockItem.id, "A-1-1")).toBe(3);
    expect(db.binMovements).toHaveLength(1);
    expect(db.binMovements[0]).toMatchObject({ reason: "PLACE", toLocation: "A-1-1", quantity: 3 });
  });

  it("skips placement when no location is given — stock stays unplaced (pre-Story-2 core behavior)", async () => {
    const { db, order, line, stockItem, warehouseId } = makeReceivingFixture({ quantity: 5 });
    await applyReceive(asClient(db), {
      orderId: order.id,
      lineId: line.id,
      qty: 3,
      expectedReceived: 0,
      warehouseId,
    });
    expect(stockItem.quantity).toBe(3);
    expect(db.bins).toHaveLength(0);
  });
});
