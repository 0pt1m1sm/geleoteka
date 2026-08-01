import { describe, expect, it } from "vitest";

import { leaseStaffNotificationDeliveries } from "@/lib/staff-notifications/dispatcher";
import {
  cancelStaffNotificationDeliveriesBefore,
  requeueDeadStaffNotificationDelivery,
  retainStaffNotificationEvents,
} from "@/lib/staff-notifications/operations";
import { TENANT_KEY } from "@/lib/tenant";

const NOW = new Date("2026-08-01T12:00:00.000Z");

describe("staff notification operations", () => {
  it("requeues the same dead delivery without creating another event", async () => {
    const db = new FakeOperationsDb();
    db.events.push(event("event_1", NOW));
    db.deliveries.push({
      ...delivery("delivery_1", "event_1", "DEAD"),
      attempts: 10,
      lastErrorCode: "TELEGRAM_REJECTED",
    });

    await expect(
      requeueDeadStaffNotificationDelivery(db, "delivery_1", NOW),
    ).resolves.toBe(true);

    expect(db.events).toEqual([event("event_1", NOW)]);
    expect(db.deliveries).toHaveLength(1);
    expect(db.deliveries[0]).toMatchObject({
      id: "delivery_1",
      eventId: "event_1",
      status: "PENDING",
      attempts: 0,
      lastErrorCode: null,
      nextAttemptAt: NOW,
    });
  });

  it("deletes old events with cascade deliveries and preserves fresh rows", async () => {
    const db = new FakeOperationsDb();
    db.events.push(
      event("old_event", new Date("2026-06-30T11:59:59.000Z")),
      event("fresh_event", new Date("2026-07-03T12:00:00.000Z")),
    );
    db.deliveries.push(
      delivery("old_delivery", "old_event"),
      delivery("fresh_delivery", "fresh_event"),
    );

    const result = await retainStaffNotificationEvents(db, {
      retentionDays: 30,
      now: NOW,
    });

    expect(result.deletedEvents).toBe(1);
    expect(result.cutoff).toEqual(new Date("2026-07-02T12:00:00.000Z"));
    expect(db.events.map((event) => event.id)).toEqual(["fresh_event"]);
    expect(db.deliveries.map((row) => row.id)).toEqual(["fresh_delivery"]);
  });

  it("cancels only active deliveries from before channel cutover before leasing", async () => {
    const enabledAt = new Date("2026-08-01T10:00:00.000Z");
    const db = new FakeOperationsDb();
    db.events.push(
      event("old_event", new Date(enabledAt.getTime() - 1)),
      event("fresh_event", new Date(enabledAt.getTime() + 1)),
    );
    db.deliveries.push(
      delivery("old_pending", "old_event", "PENDING"),
      {
        ...delivery("old_processing", "old_event", "PROCESSING"),
        leaseOwner: "stale-worker",
        leaseUntil: new Date(NOW.getTime() - 1),
      },
      delivery("old_retry", "old_event", "RETRY"),
      delivery("old_sent", "old_event", "SENT"),
      {
        ...delivery("old_dead", "old_event", "DEAD"),
        lastErrorCode: "MAX_ATTEMPTS",
      },
      delivery("fresh_pending", "fresh_event", "PENDING"),
    );
    const terminalBefore = db.deliveries
      .filter((row) => row.status === "SENT" || row.status === "DEAD")
      .map((row) => ({ ...row }));

    await expect(
      cancelStaffNotificationDeliveriesBefore(db, enabledAt),
    ).resolves.toBe(3);

    expect(
      db.deliveries
        .filter((row) => row.eventId === "old_event")
        .map((row) => [row.id, row.status, row.lastErrorCode]),
    ).toEqual([
      ["old_pending", "CANCELLED", "EVENT_BEFORE_CHANNEL_CUTOVER"],
      ["old_processing", "CANCELLED", "EVENT_BEFORE_CHANNEL_CUTOVER"],
      ["old_retry", "CANCELLED", "EVENT_BEFORE_CHANNEL_CUTOVER"],
      ["old_sent", "SENT", null],
      ["old_dead", "DEAD", "MAX_ATTEMPTS"],
    ]);
    expect(
      db.deliveries.find((row) => row.id === "fresh_pending"),
    ).toMatchObject({ status: "PENDING", lastErrorCode: null });
    expect(
      db.deliveries
        .filter((row) => row.status === "SENT" || row.status === "DEAD")
        .map((row) => ({ ...row })),
    ).toEqual(terminalBefore);

    const leased = await leaseStaffNotificationDeliveries(db, {
      workerId: "cutover-test-worker",
      now: NOW,
    });

    expect(leased.map((row) => row.deliveryId)).toEqual(["fresh_pending"]);
  });
});

function event(id: string, occurredAt: Date): EventRow {
  return { id, occurredAt, createdAt: occurredAt };
}

function delivery(
  id: string,
  eventId: string,
  status = "SENT",
): DeliveryRow {
  return {
    id,
    tenantKey: TENANT_KEY,
    eventId,
    channel: "TELEGRAM",
    destinationKey: "destination_1",
    status,
    attempts: 1,
    nextAttemptAt: NOW,
    leaseOwner: null,
    leaseUntil: null,
    providerMessageId: "provider-id",
    lastErrorCode: null,
    sentAt: NOW,
  };
}

interface EventRow {
  id: string;
  occurredAt: Date;
  createdAt: Date;
}

interface DeliveryRow {
  id: string;
  tenantKey: string;
  eventId: string;
  channel: string;
  destinationKey: string;
  status: string;
  attempts: number;
  nextAttemptAt: Date;
  leaseOwner: string | null;
  leaseUntil: Date | null;
  providerMessageId: string | null;
  lastErrorCode: string | null;
  sentAt: Date | null;
}

class FakeOperationsDb {
  events: EventRow[] = [];
  deliveries: DeliveryRow[] = [];

  staffNotificationEvent = {
    deleteMany: async (rawArgs: Record<string, unknown>) => {
      const cutoff = ((rawArgs.where as Record<string, unknown>).createdAt as {
        lt: Date;
      }).lt;
      const deletedIds = new Set(
        this.events
          .filter((event) => event.createdAt < cutoff)
          .map((event) => event.id),
      );
      this.events = this.events.filter((event) => !deletedIds.has(event.id));
      this.deliveries = this.deliveries.filter(
        (row) => !deletedIds.has(row.eventId),
      );
      return { count: deletedIds.size };
    },
  };

  staffNotificationDelivery = {
    updateMany: async (rawArgs: Record<string, unknown>) => {
      const where = rawArgs.where as DeliveryWhere;
      const rows = this.deliveries.filter((row) => this.matches(row, where));
      for (const row of rows) {
        Object.assign(row, rawArgs.data as Partial<DeliveryRow>);
      }
      return { count: rows.length };
    },
  };

  async $transaction<T>(fn: (tx: FakeOperationsDb) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async $queryRaw<T>(
    _query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T> {
    const maxAttempts = values[1] as number;
    const now = values[2] as Date;
    const limit = values[4] as number;
    const workerId = values[5] as string;
    const leaseUntil = values[6] as Date;
    const candidates = this.deliveries
      .filter(
        (row) =>
          row.attempts < maxAttempts &&
          (((row.status === "PENDING" || row.status === "RETRY") &&
            row.nextAttemptAt <= now) ||
            (row.status === "PROCESSING" &&
              row.leaseUntil !== null &&
              row.leaseUntil <= now)),
      )
      .sort(
        (left, right) =>
          left.nextAttemptAt.getTime() - right.nextAttemptAt.getTime() ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit);

    const leased = candidates.map((row) => {
      row.status = "PROCESSING";
      row.attempts += 1;
      row.leaseOwner = workerId;
      row.leaseUntil = leaseUntil;
      row.lastErrorCode = null;
      const sourceEvent = this.events.find((item) => item.id === row.eventId)!;
      return {
        deliveryId: row.id,
        tenantKey: row.tenantKey,
        channel: row.channel,
        destinationKey: row.destinationKey,
        attempts: row.attempts,
        leaseOwner: row.leaseOwner,
        leaseUntil: row.leaseUntil,
        eventId: sourceEvent.id,
        eventType: "INBOUND_CUSTOMER_MESSAGE",
        eventPriority: "P0",
        eventChannel: "EMAIL_INBOUND",
        dedupeKey: `event:${sourceEvent.id}`,
        sourceType: "CommunicationLog",
        sourceId: sourceEvent.id,
        relatedCustomerUserId: null,
        relatedDealId: null,
        relatedTaskId: null,
        targetUserId: null,
        fallbackPermission: "crm.manage",
        summary: "Новое сообщение от клиента",
        actionPath: "/admin/crm/inbox",
        occurredAt: sourceEvent.occurredAt,
        eventCreatedAt: sourceEvent.createdAt,
      };
    });
    return leased as T;
  }

  private matches(row: DeliveryRow, where: DeliveryWhere): boolean {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.tenantKey !== undefined && row.tenantKey !== where.tenantKey) {
      return false;
    }
    if (where.channel !== undefined && row.channel !== where.channel) return false;
    if (typeof where.status === "string" && row.status !== where.status) return false;
    if (
      typeof where.status === "object" &&
      where.status.in !== undefined &&
      !where.status.in.includes(row.status)
    ) {
      return false;
    }
    if (where.attempts?.gte !== undefined && row.attempts < where.attempts.gte) {
      return false;
    }
    if (
      where.leaseUntil?.lte !== undefined &&
      (row.leaseUntil === null || row.leaseUntil > where.leaseUntil.lte)
    ) {
      return false;
    }
    if (where.event?.occurredAt.lt !== undefined) {
      const sourceEvent = this.events.find((item) => item.id === row.eventId);
      if (!sourceEvent || sourceEvent.occurredAt >= where.event.occurredAt.lt) {
        return false;
      }
    }
    return true;
  }
}

interface DeliveryWhere {
  id?: string;
  tenantKey?: string;
  channel?: string;
  status?: string | { in?: string[] };
  attempts?: { gte?: number };
  leaseUntil?: { lte?: Date };
  event?: { occurredAt: { lt?: Date } };
}
