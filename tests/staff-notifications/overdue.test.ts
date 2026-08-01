import { describe, expect, it } from "vitest";

import {
  scanOverdueCrmTasks,
  type StaffNotificationOverdueScannerDb,
} from "@/lib/staff-notifications/overdue";
import type { StaffNotificationEventRecord } from "@/lib/staff-notifications/types";

const FIRST_DUE_AT = new Date("2026-08-01T08:00:00.000Z");
const SECOND_DUE_AT = new Date("2026-08-01T13:00:00.000Z");

describe("CRM task overdue scanner", () => {
  it("does not create a second event on a repeated pass for the same dueAt", async () => {
    const db = new FakeOverdueDb();
    db.tasks.push(task(FIRST_DUE_AT));

    await scanOverdueCrmTasks(db, {
      now: new Date("2026-08-01T12:00:00.000Z"),
    });
    await scanOverdueCrmTasks(db, {
      now: new Date("2026-08-01T12:05:00.000Z"),
    });

    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({
      type: "CRM_TASK_OVERDUE",
      dedupeKey: `task-overdue:task_1:${FIRST_DUE_AT.toISOString()}`,
      sourceType: "CrmTask",
      sourceId: "task_1",
      relatedTaskId: "task_1",
      occurredAt: FIRST_DUE_AT,
    });
  });

  it("creates a new event when dueAt moves and the task becomes overdue again", async () => {
    const db = new FakeOverdueDb();
    db.tasks.push(task(FIRST_DUE_AT));

    await scanOverdueCrmTasks(db, {
      now: new Date("2026-08-01T12:00:00.000Z"),
    });
    db.tasks[0].dueAt = SECOND_DUE_AT;
    await scanOverdueCrmTasks(db, {
      now: new Date("2026-08-01T14:00:00.000Z"),
    });

    expect(db.events.map((event) => event.dedupeKey)).toEqual([
      `task-overdue:task_1:${FIRST_DUE_AT.toISOString()}`,
      `task-overdue:task_1:${SECOND_DUE_AT.toISOString()}`,
    ]);
  });
});

function task(dueAt: Date) {
  return {
    id: "task_1",
    dueAt,
    ownerUserId: "manager_1",
    customerUserId: "customer_1",
    dealId: "deal_1",
  };
}

class FakeOverdueDb implements StaffNotificationOverdueScannerDb {
  tasks: Array<ReturnType<typeof task>> = [];
  events: StaffNotificationEventRecord[] = [];

  async $transaction<T>(fn: (tx: never) => Promise<T>): Promise<T> {
    return fn(this as never);
  }

  $queryRaw = async <T>(): Promise<T> => this.tasks as T;

  staffNotificationEvent = {
    upsert: async (rawArgs: Record<string, unknown>): Promise<unknown> => {
      const args = rawArgs as {
        where: {
          tenantKey_dedupeKey: { tenantKey: string; dedupeKey: string };
        };
        create: Omit<StaffNotificationEventRecord, "id" | "createdAt">;
      };
      const identity = args.where.tenantKey_dedupeKey;
      const existing = this.events.find(
        (event) =>
          event.tenantKey === identity.tenantKey &&
          event.dedupeKey === identity.dedupeKey,
      );
      if (existing) return existing;
      const created = {
        id: `event_${this.events.length + 1}`,
        createdAt: new Date("2026-08-01T14:00:00.000Z"),
        ...args.create,
      } as StaffNotificationEventRecord;
      this.events.push(created);
      return created;
    },
  };
}
