import { describe, expect, it } from "vitest";
import type { DbClientPort } from "@/lib/wms/public";
import { consumedLinesRecap, type RequiredConsumeLine } from "@/lib/warehouse/scan-consume";
import { FakeDb } from "../helpers/fake-db";

const TENANT = "geleoteka";
const WH = "wh_main";

function asClient(db: unknown): DbClientPort {
  return db as DbClientPort;
}

function fixture() {
  const db = new FakeDb();
  db.seedPart({ id: "part_a", name: "Фильтр масляный", article: "A-111" });
  db.seedPart({ id: "part_b", name: "Свеча зажигания", article: "B-222" });
  const si = db.seedStockItem({ partId: "part_a", warehouseId: WH, tenantKey: TENANT });
  // Line A consumed for order ord1 (the source triple the recap keys off).
  db.movements.push({
    id: "mv_1",
    itemId: si.id,
    reason: "CONSUMPTION",
    quantityDelta: -2,
    reservedDelta: 0,
    sourceType: "PartShipment",
    sourceId: "ord1:lineA",
    actorUserId: null,
    note: null,
    idempotencyKey: null,
    warehouseId: WH,
    tenantKey: TENANT,
  });
  const required: RequiredConsumeLine[] = [
    { lineKey: "lineA", partId: "part_a", requiredQty: 2 },
    { lineKey: "lineB", partId: "part_b", requiredQty: 1 },
  ];
  return { db, required };
}

describe("consumedLinesRecap", () => {
  it("returns only consumed lines, enriched with part identity", async () => {
    const { db, required } = fixture();
    const recap = await consumedLinesRecap(asClient(db), "PartShipment", "ord1", required);
    expect(recap).toEqual([
      { lineKey: "lineA", name: "Фильтр масляный", article: "A-111", requiredQty: 2 },
    ]);
  });

  it("is empty when nothing is consumed yet", async () => {
    const { db, required } = fixture();
    const recap = await consumedLinesRecap(asClient(db), "PartShipment", "ord2", required);
    expect(recap).toEqual([]);
  });

  it("is empty for a null/empty required list (missing order or no lines)", async () => {
    const { db } = fixture();
    expect(await consumedLinesRecap(asClient(db), "PartShipment", "ord1", null)).toEqual([]);
    expect(await consumedLinesRecap(asClient(db), "PartShipment", "ord1", [])).toEqual([]);
  });

  it("does not confuse another order's consumption (prefix isolation)", async () => {
    const { db, required } = fixture();
    // ord10's movement must not leak into ord1's recap despite the shared prefix "ord1".
    db.movements.push({ ...db.movements[0], id: "mv_2", sourceId: "ord10:lineB" });
    const recap = await consumedLinesRecap(asClient(db), "PartShipment", "ord1", required);
    expect(recap.map((l) => l.lineKey)).toEqual(["lineA"]);
  });
});
