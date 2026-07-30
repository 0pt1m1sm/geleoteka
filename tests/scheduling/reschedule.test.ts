import { describe, expect, it } from "vitest";

import {
  applyReschedule,
  isUniqueViolation,
  type DbRow,
  type ReschedulePort,
  type RescheduleTx,
} from "@/lib/scheduling/reschedule";

/**
 * Story 2 — moving a booking when the client phones to reschedule.
 *
 * What matters here is not "the field got written" but the two invariants the
 * shop depends on: the order and its calendar slot never disagree about when
 * the car is due, and a move can never quietly double-book a time the customer
 * wizard may be booking at the same moment.
 */

class PrismaUniqueViolation extends Error {
  code = "P2002";
  constructor() {
    super("Unique constraint failed on the fields: (`dateTime`)");
    this.name = "PrismaClientKnownRequestError";
  }
}

const AT_10 = new Date("2026-08-03T07:00:00.000Z");
const AT_15 = new Date("2026-08-03T12:00:00.000Z");

class FakeDb implements ReschedulePort {
  repairOrders: DbRow[] = [];
  slots: DbRow[] = [];
  /** Set to make the next slot write collide, as the unique index would. */
  collideOnSlotWrite = false;
  transactionCount = 0;

  constructor(seed?: { status?: string; withSlot?: boolean }) {
    if (seed) {
      this.repairOrders.push({ id: "ro_1", status: seed.status ?? "SCHEDULED", dateTime: AT_10 });
      if (seed.withSlot !== false) {
        this.slots.push({ id: "slot_1", repairOrderId: "ro_1", dateTime: AT_10 });
      }
    }
  }

  async $transaction<T>(fn: (tx: RescheduleTx) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const snapshot = {
      repairOrders: this.repairOrders.map((r) => ({ ...r })),
      slots: this.slots.map((s) => ({ ...s })),
    };
    try {
      return await fn(this);
    } catch (err) {
      // Roll back, so a failed move cannot leave the order and slot disagreeing.
      this.repairOrders = snapshot.repairOrders;
      this.slots = snapshot.slots;
      throw err;
    }
  }

  repairOrder = {
    findUnique: async (args: Record<string, unknown>): Promise<DbRow | null> => {
      const id = (args.where as { id?: string })?.id;
      return this.repairOrders.find((r) => r.id === id) ?? null;
    },
    update: async (args: Record<string, unknown>): Promise<DbRow> => {
      const id = (args.where as { id?: string })?.id;
      const row = this.repairOrders.find((r) => r.id === id);
      if (!row) throw new Error("repairOrder.update: not found");
      Object.assign(row, args.data as Record<string, unknown>);
      return row;
    },
  };

  slot = {
    findUnique: async (args: Record<string, unknown>): Promise<DbRow | null> => {
      const roId = (args.where as { repairOrderId?: string })?.repairOrderId;
      return this.slots.find((s) => s.repairOrderId === roId) ?? null;
    },
    update: async (args: Record<string, unknown>): Promise<DbRow> => {
      if (this.collideOnSlotWrite) throw new PrismaUniqueViolation();
      const roId = (args.where as { repairOrderId?: string })?.repairOrderId;
      const row = this.slots.find((s) => s.repairOrderId === roId);
      if (!row) throw new Error("slot.update: not found");
      Object.assign(row, args.data as Record<string, unknown>);
      return row;
    },
    create: async (args: Record<string, unknown>): Promise<DbRow> => {
      if (this.collideOnSlotWrite) throw new PrismaUniqueViolation();
      const data = args.data as Record<string, unknown>;
      const row: DbRow = { id: "slot_new", ...data };
      this.slots.push(row);
      return row;
    },
  };
}

describe("applyReschedule", () => {
  it("moves the order and its slot together", async () => {
    const db = new FakeDb({});

    const outcome = await applyReschedule("ro_1", AT_15, db);

    expect(outcome).toEqual({ ok: true });
    expect(db.repairOrders[0].dateTime).toBe(AT_15);
    expect(db.slots[0].dateTime).toBe(AT_15);
    // One transaction — not two independent writes that could half-apply.
    expect(db.transactionCount).toBe(1);
  });

  it("re-creates the slot when the order has none", async () => {
    const db = new FakeDb({ withSlot: false });

    const outcome = await applyReschedule("ro_1", AT_15, db);

    expect(outcome).toEqual({ ok: true });
    expect(db.slots).toHaveLength(1);
    expect(db.slots[0]).toMatchObject({ repairOrderId: "ro_1", dateTime: AT_15 });
  });

  it("reports a conflict instead of double-booking", async () => {
    const db = new FakeDb({});
    db.collideOnSlotWrite = true;

    const outcome = await applyReschedule("ro_1", AT_15, db);

    expect(outcome).toEqual({ ok: false, reason: "conflict" });
    // Rolled back: the order still sits at its original time.
    expect(db.repairOrders[0].dateTime).toBe(AT_10);
    expect(db.slots[0].dateTime).toBe(AT_10);
  });

  it("refuses to move a cancelled order and writes nothing", async () => {
    const db = new FakeDb({ status: "CANCELLED" });

    const outcome = await applyReschedule("ro_1", AT_15, db);

    expect(outcome).toEqual({ ok: false, reason: "cancelled" });
    expect(db.transactionCount).toBe(0);
    expect(db.repairOrders[0].dateTime).toBe(AT_10);
  });

  it("reports a missing order", async () => {
    const db = new FakeDb();

    const outcome = await applyReschedule("ro_missing", AT_15, db);

    expect(outcome).toEqual({ ok: false, reason: "not-found" });
    expect(db.transactionCount).toBe(0);
  });

  it("lets an unrelated failure surface rather than calling it a conflict", async () => {
    const db = new FakeDb({});
    db.slot.update = async () => {
      throw new Error("connection reset");
    };

    await expect(applyReschedule("ro_1", AT_15, db)).rejects.toThrow("connection reset");
  });
});

describe("isUniqueViolation", () => {
  it("recognises both shapes Prisma raises, and nothing else", () => {
    expect(isUniqueViolation(new PrismaUniqueViolation())).toBe(true);
    expect(isUniqueViolation(new Error("Unique constraint failed"))).toBe(true);
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
