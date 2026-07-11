import { describe, expect, it } from "vitest";
import { recordMovement, WmsError, type DbClientPort } from "@/lib/wms/public";
import { FakeDb } from "../helpers/fake-db";

const TENANT = "geleoteka";
const WH = "wh_main";

function fixture(): { db: FakeDb; client: DbClientPort } {
  const db = new FakeDb();
  db.seedStockItem({ partId: "part_1", warehouseId: WH, tenantKey: TENANT });
  return { db, client: db as unknown as DbClientPort };
}

function itemRef() {
  return { itemId: "part_1", warehouseId: WH };
}

describe("recordMovement validation", () => {
  it("rejects qty <= 0 for RECEIPT", async () => {
    const { client } = fixture();
    await expect(
      recordMovement(client, { item: itemRef(), reason: "RECEIPT", qty: 0, source: { type: "T", id: "1" }, tenantKey: TENANT }),
    ).rejects.toMatchObject({ code: "INVALID_QTY" });
  });

  it("rejects a null source id for every reason except ADJUSTMENT", async () => {
    const { client } = fixture();
    await expect(
      recordMovement(client, { item: itemRef(), reason: "RECEIPT", qty: 1, source: { type: "T", id: null }, tenantKey: TENANT }),
    ).rejects.toMatchObject({ code: "NULL_SOURCE" });
  });

  it("rejects a zero ADJUSTMENT but allows a negative one (signed delta)", async () => {
    const { db, client } = fixture();
    await expect(
      recordMovement(client, { item: itemRef(), reason: "ADJUSTMENT", qty: 0, source: { type: "Adj", id: null }, tenantKey: TENANT }),
    ).rejects.toMatchObject({ code: "INVALID_QTY" });

    await recordMovement(client, { item: itemRef(), reason: "RECEIPT", qty: 5, source: { type: "T", id: "seed" }, tenantKey: TENANT });
    const res = await recordMovement(client, {
      item: itemRef(),
      reason: "ADJUSTMENT",
      qty: -2,
      source: { type: "Adj", id: null },
      tenantKey: TENANT,
    });
    expect(res.applied).toBe(true);
    expect(res.quantity).toBe(3);
    expect(db.stockItems[0].quantity).toBe(3);
  });
});

describe("recordMovement deltas per reason (observable deltasForReason mapping)", () => {
  it("RECEIPT raises on-hand only", async () => {
    const { client } = fixture();
    const res = await recordMovement(client, { item: itemRef(), reason: "RECEIPT", qty: 4, source: { type: "T", id: "r1" }, tenantKey: TENANT });
    expect(res).toMatchObject({ applied: true, quantity: 4, reserved: 0, available: 4 });
  });

  it("RESERVATION raises reserved only; RELEASE lowers it back", async () => {
    const { client } = fixture();
    await recordMovement(client, { item: itemRef(), reason: "RECEIPT", qty: 4, source: { type: "T", id: "r1" }, tenantKey: TENANT });
    const held = await recordMovement(client, { item: itemRef(), reason: "RESERVATION", qty: 3, source: { type: "T", id: "h1" }, tenantKey: TENANT });
    expect(held).toMatchObject({ quantity: 4, reserved: 3, available: 1 });
    const released = await recordMovement(client, { item: itemRef(), reason: "RELEASE", qty: 3, source: { type: "T", id: "rel1" }, tenantKey: TENANT });
    expect(released).toMatchObject({ quantity: 4, reserved: 0, available: 4 });
  });

  it("CONSUMPTION lowers on-hand and clamps the reserved release at zero", async () => {
    const { client } = fixture();
    await recordMovement(client, { item: itemRef(), reason: "RECEIPT", qty: 5, source: { type: "T", id: "r1" }, tenantKey: TENANT });
    await recordMovement(client, { item: itemRef(), reason: "RESERVATION", qty: 1, source: { type: "T", id: "h1" }, tenantKey: TENANT });
    // Consume 3 while only 1 is reserved: reserved must go to 0, never negative.
    const res = await recordMovement(client, { item: itemRef(), reason: "CONSUMPTION", qty: 3, source: { type: "T", id: "c1" }, tenantKey: TENANT });
    expect(res).toMatchObject({ quantity: 2, reserved: 0, available: 2 });
  });

  it("auto-creates the stock row for a never-stocked item", async () => {
    const db = new FakeDb();
    const client = db as unknown as DbClientPort;
    const res = await recordMovement(client, {
      item: { itemId: "part_new", warehouseId: WH },
      reason: "RECEIPT",
      qty: 2,
      source: { type: "T", id: "r1" },
      tenantKey: TENANT,
    });
    expect(res.applied).toBe(true);
    expect(db.stockItems).toHaveLength(1);
    expect(db.stockItems[0]).toMatchObject({ partId: "part_new", quantity: 2 });
  });
});

describe("recordMovement idempotency", () => {
  it("replaying the same source triple is a no-op (applied:false, counters untouched)", async () => {
    const { db, client } = fixture();
    const first = await recordMovement(client, { item: itemRef(), reason: "RECEIPT", qty: 3, source: { type: "SupplierOrder", id: "o1:l1:3" }, tenantKey: TENANT });
    expect(first.applied).toBe(true);

    const replay = await recordMovement(client, { item: itemRef(), reason: "RECEIPT", qty: 3, source: { type: "SupplierOrder", id: "o1:l1:3" }, tenantKey: TENANT });
    expect(replay.applied).toBe(false);
    expect(replay.quantity).toBe(3);
    expect(db.movementsFor(db.stockItems[0].id, "RECEIPT")).toHaveLength(1);
    expect(db.stockItems[0].quantity).toBe(3);
  });

  it("same source id under a DIFFERENT reason is not a collision", async () => {
    const { db, client } = fixture();
    await recordMovement(client, { item: itemRef(), reason: "RECEIPT", qty: 3, source: { type: "S", id: "x" }, tenantKey: TENANT });
    const res = await recordMovement(client, { item: itemRef(), reason: "CONSUMPTION", qty: 1, source: { type: "S", id: "x" }, tenantKey: TENANT });
    expect(res.applied).toBe(true);
    expect(db.stockItems[0].quantity).toBe(2);
  });

  it("a replayed idempotencyKey with the SAME payload is a no-op", async () => {
    const { db, client } = fixture();
    const input = {
      item: itemRef(),
      reason: "RECEIPT" as const,
      qty: 2,
      source: { type: "ManualReceipt", id: "key-1" },
      idempotencyKey: "key-1",
      tenantKey: TENANT,
    };
    const first = await recordMovement(client, input);
    expect(first.applied).toBe(true);
    const replay = await recordMovement(client, { ...input });
    expect(replay.applied).toBe(false);
    expect(db.stockItems[0].quantity).toBe(2);
  });

  it("a reused idempotencyKey with a DIFFERENT payload is rejected, not masked", async () => {
    const { db, client } = fixture();
    await recordMovement(client, {
      item: itemRef(),
      reason: "RECEIPT",
      qty: 2,
      source: { type: "ManualReceipt", id: "key-1" },
      idempotencyKey: "key-1",
      tenantKey: TENANT,
    });
    await expect(
      recordMovement(client, {
        item: itemRef(),
        reason: "RECEIPT",
        qty: 9, // different payload, same key
        source: { type: "ManualReceipt", id: "key-1" },
        idempotencyKey: "key-1",
        tenantKey: TENANT,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(db.stockItems[0].quantity).toBe(2);
  });

  it("manual ADJUSTMENTs with null source never collide with each other", async () => {
    const { db, client } = fixture();
    await recordMovement(client, { item: itemRef(), reason: "RECEIPT", qty: 5, source: { type: "T", id: "r" }, tenantKey: TENANT });
    const a = await recordMovement(client, { item: itemRef(), reason: "ADJUSTMENT", qty: -1, source: { type: "Adj", id: null }, tenantKey: TENANT });
    const b = await recordMovement(client, { item: itemRef(), reason: "ADJUSTMENT", qty: -1, source: { type: "Adj", id: null }, tenantKey: TENANT });
    expect(a.applied).toBe(true);
    expect(b.applied).toBe(true);
    expect(db.stockItems[0].quantity).toBe(3);
  });
});

// The WmsError import participates in the assertions above via code matching;
// keep a direct sanity check that the class carries the structured code.
describe("WmsError taxonomy", () => {
  it("exposes a stable machine-readable code", () => {
    expect(WmsError.locationBlocked().code).toBe("LOCATION_BLOCKED");
  });
});
