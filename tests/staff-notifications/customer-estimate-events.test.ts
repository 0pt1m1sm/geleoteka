import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffNotificationEventRecord } from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

const h = vi.hoisted(() => ({
  stage: "SENT",
  declineReason: null as string | null,
  events: [] as StaffNotificationEventRecord[],
  eventWriteError: null as Error | null,
  release: vi.fn(async () => undefined),
  revalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(async () => null) }));
vi.mock("@/lib/tokens", () => ({ tokensMatch: vi.fn(() => true) }));
vi.mock("@/lib/fulfillment/reservations", () => ({
  releasePartLinesForEstimate: h.release,
}));
vi.mock("@/lib/crm/public", () => ({
  dispatchFulfillment: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db", () => ({
  db: {
    estimate: {
      findUnique: async () => ({
        id: "estimate_1",
        stage: h.stage,
        dealId: "deal_1",
        deal: {
          id: "deal_1",
          number: "D-1042",
          customerUserId: "customer_1",
          ownerUserId: "manager_1",
          claimToken: "claim_1",
          customer: { name: "Иван Клиент" },
        },
      }),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = {
        stage: h.stage,
        declineReason: h.declineReason,
        events: h.events.map((event) => ({ ...event })),
      };
      const tx = {
        estimate: {
          updateMany: async (args: Record<string, unknown>) => {
            const where = args.where as { stage: string };
            if (h.stage !== where.stage) return { count: 0 };
            const data = args.data as { stage: string; declineReason: string };
            h.stage = data.stage;
            h.declineReason = data.declineReason;
            return { count: 1 };
          },
        },
        staffNotificationEvent: {
          upsert: async (rawArgs: Record<string, unknown>) => {
            if (h.eventWriteError) throw h.eventWriteError;
            const args = rawArgs as {
              where: {
                tenantKey_dedupeKey: { tenantKey: string; dedupeKey: string };
              };
              create: Omit<StaffNotificationEventRecord, "id" | "createdAt">;
            };
            const key = args.where.tenantKey_dedupeKey;
            const existing = h.events.find(
              (event) =>
                event.tenantKey === key.tenantKey &&
                event.dedupeKey === key.dedupeKey,
            );
            if (existing) return existing;
            const event = {
              id: "event_declined_1",
              createdAt: new Date("2026-08-01T10:30:00.000Z"),
              ...args.create,
            } as StaffNotificationEventRecord;
            h.events.push(event);
            return event;
          },
        },
      };
      try {
        return await fn(tx);
      } catch (error) {
        h.stage = snapshot.stage;
        h.declineReason = snapshot.declineReason;
        h.events = snapshot.events;
        throw error;
      }
    },
  },
}));

import { customerDeclineEstimate } from "@/app/actions/customer-estimates";
import { toSafeChannelPayload } from "@/lib/staff-notifications/publish";

describe("customer estimate notification producer", () => {
  beforeEach(() => {
    h.stage = "SENT";
    h.declineReason = null;
    h.events = [];
    h.eventWriteError = null;
    h.release.mockClear();
    h.revalidate.mockClear();
  });

  it("publishes one event on repeated decline and excludes the customer reason", async () => {
    const sentinel = "DECLINE-REASON-SENTINEL";

    await expect(
      customerDeclineEstimate("estimate_1", sentinel, "claim_1"),
    ).resolves.toMatchObject({ success: true });
    await expect(
      customerDeclineEstimate("estimate_1", sentinel, "claim_1"),
    ).resolves.toMatchObject({ error: "Смета недоступна для отклонения" });

    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({
      tenantKey: TENANT_KEY,
      type: "ESTIMATE_CUSTOMER_DECLINED",
      sourceType: "Estimate",
      sourceId: "estimate_1",
      targetUserId: "manager_1",
    });
    expect(JSON.stringify(toSafeChannelPayload(h.events[0]))).not.toContain(sentinel);
  });

  it("rolls back the estimate decline when event publication fails", async () => {
    h.eventWriteError = new Error("EVENT_WRITE_FAILED");

    await expect(
      customerDeclineEstimate("estimate_1", "Причина", "claim_1"),
    ).rejects.toThrow("EVENT_WRITE_FAILED");

    expect(h.stage).toBe("SENT");
    expect(h.declineReason).toBeNull();
    expect(h.events).toHaveLength(0);
  });
});
