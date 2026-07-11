import { describe, expect, it } from "vitest";
import type { DbClientPort } from "@/lib/wms/public";
import { applyReceive, applyUndoReceive } from "@/lib/warehouse/receive";
import { makeReceivingFixture, FakeDb } from "../helpers/fake-db";

const WH = "wh_main";

function asClient(db: unknown): DbClientPort {
  return db as DbClientPort;
}

/** Receive via the fake's tx wrapper — mirrors the action's db.$transaction. */
async function receiveTx(db: FakeDb, input: Parameters<typeof applyReceive>[1]) {
  return db.$transaction((tx) => applyReceive(asClient(tx), input));
}

async function undoTx(db: FakeDb, input: Parameters<typeof applyUndoReceive>[1]) {
  return db.$transaction((tx) => applyUndoReceive(asClient(tx), input));
}

/** Fixture with `received` units already received into ПРИЁМКА via the real path. */
async function receivedFixture(opts: { quantity: number; receive: number }) {
  const fx = makeReceivingFixture({ quantity: opts.quantity });
  const res = await receiveTx(fx.db, {
    orderId: fx.order.id,
    lineId: fx.line.id,
    qty: opts.receive,
    expectedReceived: 0,
    location: "ПРИЁМКА",
    warehouseId: WH,
  });
  expect(res.error).toBeNull();
  return fx;
}

describe("applyUndoReceive — happy paths", () => {
  it("partial undo lowers receivedQuantity, on-hand and the bin; RECEIVED → PARTIALLY_RECEIVED + receivedAt cleared", async () => {
    const { db, order, line, stockItem } = await receivedFixture({ quantity: 3, receive: 3 });
    expect(order.status).toBe("RECEIVED");
    expect(order.receivedAt).toBeInstanceOf(Date);

    const res = await undoTx(db, {
      orderId: order.id,
      lineId: line.id,
      qty: 1,
      expectedReceived: 3,
      location: "ПРИЁМКА",
      warehouseId: WH,
    });

    expect(res.error).toBeNull();
    expect(res.received).toBe(2);
    expect(res.status).toBe("PARTIALLY_RECEIVED");
    expect(line.receivedQuantity).toBe(2);
    expect(stockItem.quantity).toBe(2);
    expect(db.binQty(stockItem.id, "ПРИЁМКА")).toBe(2);
    expect(order.status).toBe("PARTIALLY_RECEIVED");
    expect(order.receivedAt).toBeNull();
    // Ledger: one RECEIPT + one RECEIPT_REVERSAL, both audited.
    expect(db.movementsFor(stockItem.id, "RECEIPT")).toHaveLength(1);
    expect(db.movementsFor(stockItem.id, "RECEIPT_REVERSAL")).toHaveLength(1);
    expect(db.movementsFor(stockItem.id, "RECEIPT_REVERSAL")[0].quantityDelta).toBe(-1);
  });

  it("full undo returns the order to ORDERED with receivedAt cleared", async () => {
    const { db, order, line, stockItem } = await receivedFixture({ quantity: 3, receive: 3 });
    const res = await undoTx(db, {
      orderId: order.id,
      lineId: line.id,
      qty: 3,
      expectedReceived: 3,
      location: "ПРИЁМКА",
      warehouseId: WH,
    });
    expect(res.error).toBeNull();
    expect(res.received).toBe(0);
    expect(order.status).toBe("ORDERED");
    expect(order.receivedAt).toBeNull();
    expect(stockItem.quantity).toBe(0);
    expect(db.binQty(stockItem.id, "ПРИЁМКА")).toBe(0);
  });

  it("undo without a location skips bin removal (legacy unplaced receipts)", async () => {
    const fx = makeReceivingFixture({ quantity: 3 });
    // Receive WITHOUT placement (pre-Story-2 style): stage via applyReceive with no location.
    await receiveTx(fx.db, { orderId: fx.order.id, lineId: fx.line.id, qty: 2, expectedReceived: 0, warehouseId: WH });
    expect(fx.db.bins).toHaveLength(0);

    const res = await undoTx(fx.db, {
      orderId: fx.order.id,
      lineId: fx.line.id,
      qty: 1,
      expectedReceived: 2,
      warehouseId: WH,
    });
    expect(res.error).toBeNull();
    expect(fx.stockItem.quantity).toBe(1);
    expect(fx.db.bins).toHaveLength(0);
  });

  it("undo of an over-receipt keeps RECEIVED while every line is still full", async () => {
    const { db, order, line } = await receivedFixture({ quantity: 3, receive: 5 }); // over-received
    const res = await undoTx(db, {
      orderId: order.id,
      lineId: line.id,
      qty: 1,
      expectedReceived: 5,
      location: "ПРИЁМКА",
      warehouseId: WH,
    });
    expect(res.error).toBeNull();
    expect(line.receivedQuantity).toBe(4); // still ≥ quantity
    expect(order.status).toBe("RECEIVED");
    expect(order.receivedAt).toBeInstanceOf(Date);
  });
});

describe("applyUndoReceive — guards (all fail closed, nothing written)", () => {
  it("stale CAS token → { stale: true }, state untouched", async () => {
    const { db, order, line, stockItem } = await receivedFixture({ quantity: 3, receive: 3 });
    const res = await undoTx(db, {
      orderId: order.id,
      lineId: line.id,
      qty: 1,
      expectedReceived: 2, // stale — line is at 3
      location: "ПРИЁМКА",
      warehouseId: WH,
    });
    expect(res.stale).toBe(true);
    expect(db.supplierOrderItems.find((l) => l.id === line.id)?.receivedQuantity).toBe(3);
    expect(db.stockItems.find((s) => s.id === stockItem.id)?.quantity).toBe(3);
    expect(db.movementsFor(stockItem.id, "RECEIPT_REVERSAL")).toHaveLength(0);
  });

  it("qty greater than received → error", async () => {
    const { db, order, line } = await receivedFixture({ quantity: 3, receive: 2 });
    const res = await undoTx(db, {
      orderId: order.id,
      lineId: line.id,
      qty: 3,
      expectedReceived: 2,
      warehouseId: WH,
    });
    expect(res.error).toBe("Нельзя сторнировать больше, чем принято");
  });

  it.each(["COMPLETED", "CANCELLED"])("%s order is closed for undo", async (status) => {
    const { db, order, line } = await receivedFixture({ quantity: 3, receive: 2 });
    order.status = status;
    const res = await undoTx(db, {
      orderId: order.id,
      lineId: line.id,
      qty: 1,
      expectedReceived: 2,
      warehouseId: WH,
    });
    expect(res.error).toBe("Заказ закрыт для изменений");
    expect(line.receivedQuantity).toBe(2);
  });

  it("rejects when the stock was already consumed (on-hand would go negative)", async () => {
    const { db, order, line, stockItem } = await receivedFixture({ quantity: 3, receive: 2 });
    // Simulate consumption after receipt: on-hand drops to 0 while receivedQuantity stays 2.
    stockItem.quantity = 0;
    db.bins.length = 0;
    const res = await undoTx(db, {
      orderId: order.id,
      lineId: line.id,
      qty: 1,
      expectedReceived: 2,
      warehouseId: WH,
    });
    expect(res.error).toBe("Нельзя сторнировать: остаток уже списан");
    expect(db.supplierOrderItems.find((l) => l.id === line.id)?.receivedQuantity).toBe(2);
    expect(db.movementsFor(stockItem.id, "RECEIPT_REVERSAL")).toHaveLength(0);
  });

  it("rejects when the remainder would fall below the reserved hold (received then reserved by an RO)", async () => {
    const { db, order, line, stockItem } = await receivedFixture({ quantity: 3, receive: 3 });
    stockItem.reserved = 3; // a repair order reserved everything we just received
    const res = await undoTx(db, {
      orderId: order.id,
      lineId: line.id,
      qty: 1,
      expectedReceived: 3,
      location: "ПРИЁМКА",
      warehouseId: WH,
    });
    expect(res.error).toBe("Нельзя сторнировать: остаток зарезервирован");
    expect(db.supplierOrderItems.find((l) => l.id === line.id)?.receivedQuantity).toBe(3);
  });

  it("insufficient bin rolls back the WHOLE undo — receivedQuantity, on-hand and audit all unchanged", async () => {
    const { db, order, line } = await receivedFixture({ quantity: 3, receive: 3 });
    // The bin holds 3, but ask to pull 2 out of a different (empty) cell.
    await expect(
      undoTx(db, {
        orderId: order.id,
        lineId: line.id,
        qty: 2,
        expectedReceived: 3,
        location: "A-9-9",
        warehouseId: WH,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BIN" });

    // Post-rollback state must be identical to pre-undo (re-read, refs were swapped).
    expect(db.supplierOrderItems.find((l) => l.id === line.id)?.receivedQuantity).toBe(3);
    const si = db.stockItems.find((s) => s.partId === "part_1");
    expect(si?.quantity).toBe(3);
    expect(db.binQty(si!.id, "ПРИЁМКА")).toBe(3);
    expect(db.movements.filter((m) => m.reason === "RECEIPT_REVERSAL")).toHaveLength(0);
    expect(db.binMovements.filter((m) => m.reason === "REMOVE")).toHaveLength(0);
  });

  it("a forced movement no-op (fake-injected collision) aborts atomically — no partial undo survives", async () => {
    const { db, order, line } = await receivedFixture({ quantity: 3, receive: 3 });
    db.failNextMovementInsertWithP2002 = true; // reversal insert will P2002 → applied:false path
    await expect(
      undoTx(db, {
        orderId: order.id,
        lineId: line.id,
        qty: 1,
        expectedReceived: 3,
        location: "ПРИЁМКА",
        warehouseId: WH,
      }),
    ).rejects.toBeTruthy();

    // CAS decrement AND the bin removal must both have rolled back.
    expect(db.supplierOrderItems.find((l) => l.id === line.id)?.receivedQuantity).toBe(3);
    const si = db.stockItems.find((s) => s.partId === "part_1");
    expect(si?.quantity).toBe(3);
    expect(db.binQty(si!.id, "ПРИЁМКА")).toBe(3);
  });
});

describe("critic C1 regression — undo breaks receivedQuantity monotonicity", () => {
  it("receive → undo → re-receive to a previously-seen count stays fully consistent (twice)", async () => {
    const { db, order, line, stockItem } = await receivedFixture({ quantity: 3, receive: 3 });

    for (let cycle = 0; cycle < 2; cycle++) {
      const undo = await undoTx(db, {
        orderId: order.id,
        lineId: line.id,
        qty: 1,
        expectedReceived: 3,
        location: "ПРИЁМКА",
        warehouseId: WH,
      });
      expect(undo.error).toBeNull();
      expect(line.receivedQuantity).toBe(2);
      expect(db.stockItems.find((s) => s.id === stockItem.id)?.quantity).toBe(2);

      // Re-receive back to 3 — the count "3" was already seen; the old
      // cumulative-count source id would silently collide here (applied:false)
      // and desync on-hand from receivedQuantity.
      const rec = await receiveTx(db, {
        orderId: order.id,
        lineId: line.id,
        qty: 1,
        expectedReceived: 2,
        location: "ПРИЁМКА",
        warehouseId: WH,
      });
      expect(rec.error).toBeNull();
      expect(line.receivedQuantity).toBe(3);
      const si = db.stockItems.find((s) => s.id === stockItem.id);
      expect(si?.quantity).toBe(3); // ← the C1 desync would leave this at 2
      expect(db.binQty(si!.id, "ПРИЁМКА")).toBe(3);
      expect(order.status).toBe("RECEIVED");
    }

    // Ledger stays append-only and complete: 3 receipts (1 initial + 2 re-receives), 2 reversals.
    expect(db.movementsFor(stockItem.id, "RECEIPT")).toHaveLength(3);
    expect(db.movementsFor(stockItem.id, "RECEIPT_REVERSAL")).toHaveLength(2);
  });
});
