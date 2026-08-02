import { describe, expect, it, vi } from "vitest";

import { parseBooleanSetting } from "@/lib/settings-shared";
import {
  inboundCustomerMessageDedupeKey,
  publishStaffNotificationEvent,
  toSafeChannelPayload,
  type StaffNotificationPublishTx,
} from "@/lib/staff-notifications/publish";
import {
  assertSafeAdminActionUrl,
  isSafeAdminActionUrl,
} from "@/lib/staff-notifications/safe-action-url";
import {
  routeStaffNotificationEvent,
  selectStaffNotificationRecipients,
  type StaffNotificationRouterTx,
} from "@/lib/staff-notifications/router";
import { staffNotificationTypesForPermissions } from "@/lib/staff-notifications/preferences";
import type { StaffNotificationEventRecord } from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

const OCCURRED_AT = new Date("2026-08-01T08:30:00.000Z");

describe("staff notification publish", () => {
  it("is idempotent on the tenant-scoped dedupeKey", async () => {
    const rows = new Map<string, StaffNotificationEventRecord>();
    let creates = 0;
    const client: StaffNotificationPublishTx = {
      staffNotificationEvent: {
        async upsert(rawArgs) {
          const args = rawArgs as {
            where: { tenantKey_dedupeKey: { tenantKey: string; dedupeKey: string } };
            create: Omit<StaffNotificationEventRecord, "id" | "createdAt">;
          };
          const key = `${args.where.tenantKey_dedupeKey.tenantKey}:${args.where.tenantKey_dedupeKey.dedupeKey}`;
          const existing = rows.get(key);
          if (existing) return existing;
          creates += 1;
          const created = {
            id: "event_1",
            createdAt: OCCURRED_AT,
            ...args.create,
          } as StaffNotificationEventRecord;
          rows.set(key, created);
          return created;
        },
      },
    };

    const input = {
      type: "INBOUND_CUSTOMER_MESSAGE" as const,
      channel: "WHATSAPP_INBOUND" as const,
      dedupeKey: inboundCustomerMessageDedupeKey("comm_log_42"),
      sourceType: "CommunicationLog",
      sourceId: "comm_log_42",
      relatedCustomerUserId: "customer_1",
      relatedDealId: "deal_1042",
      safeSummary: "Новое сообщение от клиента",
      actionPath: "/admin/crm/deals/deal_1042",
      occurredAt: OCCURRED_AT,
    };

    const first = await publishStaffNotificationEvent(client, input);
    const replay = await publishStaffNotificationEvent(client, input);

    expect(creates).toBe(1);
    expect(rows).toHaveLength(1);
    expect(first.id).toBe(replay.id);
    expect(first.type).toBe("INBOUND_CUSTOMER_MESSAGE");
    expect(first.channel).toBe("WHATSAPP_INBOUND");
    expect(first.dedupeKey).toBe("inbound-msg:comm_log_42");
    expect(first.sourceType).toBe("CommunicationLog");
    expect(first.sourceId).toBe("comm_log_42");
  });

  it("builds the adapter DTO with exactly the safe fields", () => {
    const payload = toSafeChannelPayload(eventRecord());
    expect(Object.keys(payload).sort()).toEqual(
      ["actionUrl", "eventId", "occurredAt", "priority", "safeSummary", "type"].sort(),
    );
  });

  it("rejects an inbound-message dedupe key that is not based on CommunicationLog.id", async () => {
    const client: StaffNotificationPublishTx = {
      staffNotificationEvent: { upsert: vi.fn() },
    };

    await expect(
      publishStaffNotificationEvent(client, {
        type: "INBOUND_CUSTOMER_MESSAGE",
        channel: "EMAIL_INBOUND",
        dedupeKey: "transport-message:email_99",
        sourceType: "CommunicationLog",
        sourceId: "comm_log_1",
        safeSummary: "Новое сообщение от клиента",
        actionPath: "/admin/crm/deals/1042",
        occurredAt: OCCURRED_AT,
      }),
    ).rejects.toThrow("CommunicationLog.id");
  });
});

describe("safe staff notification action URLs", () => {
  it("rejects an external URL", () => {
    expect(isSafeAdminActionUrl("https://evil.example/admin/crm/deals/1")).toBe(false);
    expect(() => assertSafeAdminActionUrl("https://evil.example/admin/crm/deals/1")).toThrow();
  });

  it("rejects a query string", () => {
    expect(isSafeAdminActionUrl("/admin/crm/deals/1?claimToken=secret")).toBe(false);
    expect(() => assertSafeAdminActionUrl("/admin/crm/deals/1?claimToken=secret")).toThrow();
  });

  it("accepts a normalized internal admin path", () => {
    expect(assertSafeAdminActionUrl("/admin/crm/deals/1042#communication-7")).toBe(
      "/admin/crm/deals/1042#communication-7",
    );
  });
});

describe("staff notification router", () => {
  it("does not fan out an opted-out target-only assignment to fallback staff", () => {
    expect(
      selectStaffNotificationRecipients(
        {
          type: "TASK_ASSIGNED",
          targetUserId: "owner",
          fallbackPermission: "crm.manage",
        },
        [
          {
            userId: "owner",
            canViewNotifications: true,
            permissions: new Set(["notifications.view", "crm.manage"]),
            disabledEventTypes: new Set(["TASK_ASSIGNED"]),
          },
          {
            userId: "other_manager",
            canViewNotifications: true,
            permissions: new Set(["notifications.view", "crm.manage"]),
            disabledEventTypes: new Set(),
          },
        ],
      ),
    ).toEqual([]);
  });

  it("shows profile categories only for effective notification and domain rights", () => {
    expect(
      staffNotificationTypesForPermissions(
        new Set(["notifications.view", "parts.manage"]),
      ),
    ).toEqual(["PARTS_ORDER_CREATED"]);
    expect(staffNotificationTypesForPermissions(new Set(["parts.manage"]))).toEqual([]);
  });

  it("requires both notifications.view and the event domain permission", () => {
    expect(
      selectStaffNotificationRecipients(
        {
          type: "INBOUND_CUSTOMER_MESSAGE",
          targetUserId: "owner",
          fallbackPermission: "crm.manage",
        },
        [
          {
            userId: "owner",
            canViewNotifications: true,
            permissions: new Set(["notifications.view"]),
            disabledEventTypes: new Set(),
          },
          {
            userId: "crm_without_feed",
            canViewNotifications: false,
            permissions: new Set(["crm.manage"]),
            disabledEventTypes: new Set(),
          },
          {
            userId: "eligible_fallback",
            canViewNotifications: true,
            permissions: new Set(["notifications.view", "crm.manage"]),
            disabledEventTypes: new Set(),
          },
        ],
      ),
    ).toEqual(["eligible_fallback"]);
  });

  it("creates no receipts or deliveries when there are no recipients", async () => {
    const receiptCreateMany = vi.fn(async () => ({ count: 0 }));
    const deliveryCreateMany = vi.fn(async () => ({ count: 0 }));
    const eventUpdate = vi.fn(async () => ({}));
    const client: StaffNotificationRouterTx = {
      staffNotificationReceipt: { createMany: receiptCreateMany },
      staffNotificationDelivery: { createMany: deliveryCreateMany },
      staffNotificationEvent: { update: eventUpdate },
    };

    const result = await routeStaffNotificationEvent(client, {
      event: eventRecord(),
      candidates: [],
      destinations: [
        { recipientUserId: null, channel: "TELEGRAM", destinationKey: "shared_dest_1" },
      ],
      routedAt: new Date("2026-08-01T09:00:00.000Z"),
    });

    expect(result).toEqual({
      recipientUserIds: [],
      receiptsCreated: 0,
      deliveriesCreated: 0,
      outcome: "no-recipients",
    });
    expect(receiptCreateMany).not.toHaveBeenCalled();
    expect(deliveryCreateMany).not.toHaveBeenCalled();
    expect(eventUpdate).toHaveBeenCalledOnce();
  });

  it("does not route PARTS_ORDER_CREATED to staff without parts.manage", () => {
    expect(
      selectStaffNotificationRecipients(
        {
          type: "PARTS_ORDER_CREATED",
          targetUserId: null,
          fallbackPermission: "parts.manage",
        },
        [
          {
            userId: "crm_manager",
            canViewNotifications: true,
            permissions: new Set(["notifications.view", "crm.manage"]),
            disabledEventTypes: new Set(),
          },
          {
            userId: "parts_manager",
            canViewNotifications: true,
            permissions: new Set(["notifications.view", "parts.manage"]),
            disabledEventTypes: new Set(),
          },
        ],
      ),
    ).toEqual(["parts_manager"]);
  });

  it("lets a personal opt-out suppress one employee without suppressing the others", async () => {
    const receiptCreateMany = vi.fn(async () => ({ count: 1 }));
    const deliveryCreateMany = vi.fn(async () => ({ count: 1 }));
    const client: StaffNotificationRouterTx = {
      staffNotificationReceipt: { createMany: receiptCreateMany },
      staffNotificationDelivery: { createMany: deliveryCreateMany },
      staffNotificationEvent: { update: vi.fn(async () => ({})) },
    };

    const result = await routeStaffNotificationEvent(client, {
      event: { ...eventRecord(), targetUserId: null },
      candidates: [
        {
          userId: "manager_opted_out",
          canViewNotifications: true,
          permissions: new Set(["notifications.view", "crm.manage"]),
          disabledEventTypes: new Set(["INBOUND_CUSTOMER_MESSAGE"]),
        },
        {
          userId: "manager_enabled",
          canViewNotifications: true,
          permissions: new Set(["notifications.view", "crm.manage"]),
          disabledEventTypes: new Set(),
        },
      ],
      destinations: [
        {
          recipientUserId: "manager_opted_out",
          channel: "TELEGRAM",
          destinationKey: "telegram_opted_out",
        },
        {
          recipientUserId: "manager_enabled",
          channel: "TELEGRAM",
          destinationKey: "telegram_enabled",
        },
      ],
    });

    expect(result.recipientUserIds).toEqual(["manager_enabled"]);
    expect(receiptCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ userId: "manager_enabled" })],
      }),
    );
    expect(deliveryCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ destinationKey: "telegram_enabled" })],
      }),
    );
  });

  it("cannot use the absence of an opt-out to grant a missing domain permission", () => {
    expect(
      selectStaffNotificationRecipients(
        {
          type: "PARTS_ORDER_CREATED",
          targetUserId: "manager_without_parts",
          fallbackPermission: "parts.manage",
        },
        [
          {
            userId: "manager_without_parts",
            canViewNotifications: true,
            permissions: new Set(["notifications.view", "crm.manage"]),
            disabledEventTypes: new Set(),
          },
        ],
      ),
    ).toEqual([]);
  });

  it("treats no personal setting as enabled", () => {
    expect(
      selectStaffNotificationRecipients(
        {
          type: "PARTS_ORDER_CREATED",
          targetUserId: null,
          fallbackPermission: "parts.manage",
        },
        [
          {
            userId: "existing_parts_manager",
            canViewNotifications: true,
            permissions: new Set(["notifications.view", "parts.manage"]),
            disabledEventTypes: new Set(),
          },
        ],
      ),
    ).toEqual(["existing_parts_manager"]);
  });
});

describe("Telegram dark-mode switches", () => {
  it("fails closed for absent and malformed values", () => {
    expect(parseBooleanSetting(null)).toBe(false);
    expect(parseBooleanSetting(undefined)).toBe(false);
    expect(parseBooleanSetting("")).toBe(false);
    expect(parseBooleanSetting("yes")).toBe(false);
    expect(parseBooleanSetting("broken")).toBe(false);
    expect(parseBooleanSetting("false")).toBe(false);
    expect(parseBooleanSetting(" true ")).toBe(true);
  });
});

function eventRecord(): StaffNotificationEventRecord {
  return {
    id: "event_1",
    tenantKey: TENANT_KEY,
    type: "INBOUND_CUSTOMER_MESSAGE",
    priority: "P0",
    channel: "EMAIL_INBOUND",
    dedupeKey: "inbound-msg:comm_log_1",
    sourceType: "CommunicationLog",
    sourceId: "comm_log_1",
    relatedCustomerUserId: "customer_1",
    relatedDealId: "deal_1042",
    relatedTaskId: null,
    targetUserId: null,
    fallbackPermission: "crm.manage",
    summary: "Новое письмо от клиента",
    actionPath: "/admin/crm/deals/1042#communication-1",
    occurredAt: OCCURRED_AT,
    createdAt: OCCURRED_AT,
  };
}
