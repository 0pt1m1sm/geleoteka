import { describe, expect, it } from "vitest";

import {
  projectInboundCustomerMessageEvent,
  projectPendingInboundCustomerMessages,
  projectStaffNotificationEvent,
  type InboundCustomerMessageProjectorDb,
} from "@/lib/staff-notifications/projectors/inbound-customer-message";
import type { StaffNotificationEventRecord } from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";
import { FakeEmailDb } from "../email/fake-db";

const NOW = new Date("2026-08-01T12:00:00.000Z");

describe("inbound customer message projector retries", () => {
  it("moves a transient failure to DEAD at the attempt limit and never selects it again", async () => {
    const db = new FakeEmailDb();
    db.staffNotificationEvents.push({
      ...eventRecord(),
      routingStatus: "PENDING",
      routingAttempts: 4,
      nextRoutingAt: new Date("2026-08-01T11:59:00.000Z"),
      routedAt: null,
      lastRoutingError: null,
    });
    db.communicationLogFindUniqueError = new Error("database response with private content");

    await expect(projectPendingInboundCustomerMessages(projectorDb(db), 25, NOW)).resolves.toBe(0);
    expect(db.staffNotificationEvents[0]).toMatchObject({
      routingStatus: "DEAD",
      routingAttempts: 5,
      lastRoutingError: "TRANSIENT_FAILURE",
    });
    expect(String(db.staffNotificationEvents[0].lastRoutingError)).not.toContain("private content");

    await expect(projectPendingInboundCustomerMessages(projectorDb(db), 25, NOW)).resolves.toBe(0);
    expect(db.communicationLogFindUniqueCalls).toBe(1);
  });

  it("does not select a retry before nextRoutingAt", async () => {
    const db = new FakeEmailDb();
    db.staffNotificationEvents.push({
      ...eventRecord(),
      routingStatus: "RETRY",
      routingAttempts: 1,
      nextRoutingAt: new Date("2026-08-01T12:01:00.000Z"),
      routedAt: null,
      lastRoutingError: "TRANSIENT_FAILURE",
    });
    db.communicationLogFindUniqueError = new Error("still unavailable");

    await expect(projectPendingInboundCustomerMessages(projectorDb(db), 25, NOW)).resolves.toBe(0);
    expect(db.communicationLogFindUniqueCalls).toBe(0);
    expect(db.staffNotificationEvents[0]).toMatchObject({
      routingStatus: "RETRY",
      routingAttempts: 1,
    });
  });
});

describe("Telegram routing", () => {
  it("routes an assigned event only to the eligible owner's personal destination", async () => {
    const db = routableDb("manager_1");
    db.telegramDestinations.push({
      id: "personal_1",
      tenantKey: TENANT_KEY,
      kind: "PERSONAL",
      userId: "manager_1",
      isActive: true,
      disabledAt: null,
    });
    db.telegramDestinations.push({
      id: "shared_1",
      tenantKey: TENANT_KEY,
      kind: "SHARED",
      userId: null,
      isActive: true,
      disabledAt: null,
    });

    await expect(
      projectInboundCustomerMessageEvent(projectorDb(db), "event_route", NOW),
    ).resolves.toBe("projected");
    expect(db.staffNotificationDeliveries).toHaveLength(1);
    expect(db.staffNotificationDeliveries[0]).toMatchObject({
      channel: "TELEGRAM",
      destinationKey: "personal_1",
    });
  });

  it("uses only the shared fallback for an unassigned event", async () => {
    const db = routableDb(null);
    db.telegramDestinations.push({
      id: "personal_1",
      tenantKey: TENANT_KEY,
      kind: "PERSONAL",
      userId: "manager_1",
      isActive: true,
      disabledAt: null,
    });
    db.telegramDestinations.push({
      id: "shared_1",
      tenantKey: TENANT_KEY,
      kind: "SHARED",
      userId: null,
      isActive: true,
      disabledAt: null,
    });

    await expect(
      projectInboundCustomerMessageEvent(projectorDb(db), "event_route", NOW),
    ).resolves.toBe("projected");
    expect(db.staffNotificationDeliveries).toHaveLength(1);
    expect(db.staffNotificationDeliveries[0]).toMatchObject({
      channel: "TELEGRAM",
      destinationKey: "shared_1",
    });
  });

  it("does not deliver an event that occurred before channel enablement", async () => {
    const db = routableDb("manager_1");
    db.staffNotificationEvents[0].occurredAt = new Date(NOW.getTime() - 1);
    db.telegramDestinations.push({
      id: "personal_1",
      tenantKey: TENANT_KEY,
      kind: "PERSONAL",
      userId: "manager_1",
      isActive: true,
      disabledAt: null,
    });

    await expect(
      projectInboundCustomerMessageEvent(projectorDb(db), "event_route", NOW),
    ).resolves.toBe("projected");

    expect(db.staffNotificationReceipts).toHaveLength(1);
    expect(db.staffNotificationDeliveries).toHaveLength(0);
    expect(db.staffNotificationEvents[0]).toMatchObject({
      routingStatus: "ROUTED",
    });
  });

  it("routes the internal feed but creates no delivery backlog while Telegram is off", async () => {
    const db = routableDb("manager_1");
    const enabled = db.settings.find((row) => row.key === "TELEGRAM_ENABLED");
    if (!enabled) throw new Error("test Telegram setting missing");
    enabled.value = "false";
    db.telegramDestinations.push({
      id: "personal_1",
      tenantKey: TENANT_KEY,
      kind: "PERSONAL",
      userId: "manager_1",
      isActive: true,
      disabledAt: null,
    });

    await expect(
      projectInboundCustomerMessageEvent(projectorDb(db), "event_route", NOW),
    ).resolves.toBe("projected");

    expect(db.staffNotificationReceipts).toHaveLength(1);
    expect(db.staffNotificationDeliveries).toHaveLength(0);
  });

  it("routes a Story 5 parts event through the same router and shared destination", async () => {
    const db = new FakeEmailDb();
    db.users.push({
      id: "admin_1",
      name: "Администратор",
      permissionRole: "ADMIN",
      deletedAt: null,
    });
    db.staffNotificationEvents.push({
      ...eventRecord(),
      id: "event_parts",
      type: "PARTS_ORDER_CREATED",
      priority: "P1",
      channel: null,
      dedupeKey: "parts-order-created:part_order_1",
      sourceType: "PartOrder",
      sourceId: "part_order_1",
      relatedDealId: "deal_1",
      relatedTaskId: null,
      targetUserId: null,
      fallbackPermission: "parts.manage",
      routingStatus: "PENDING",
      routingAttempts: 0,
      nextRoutingAt: NOW,
      routedAt: null,
      lastRoutingError: null,
    });
    db.telegramDestinations.push({
      id: "shared_parts",
      tenantKey: TENANT_KEY,
      kind: "SHARED",
      userId: null,
      isActive: true,
      disabledAt: null,
    });
    for (const [key, value] of Object.entries({
      TELEGRAM_ENABLED: "true",
      TELEGRAM_ENABLED_AT: NOW.toISOString(),
      TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(32)}`,
      TELEGRAM_BOT_USERNAME: "GeleotekaStaffBot",
      TELEGRAM_WEBHOOK_SECRET: "W".repeat(32),
      TELEGRAM_ROUTING_MODE: "PERSONAL_WITH_SHARED_FALLBACK",
      TELEGRAM_NOTIFY_PARTS_ORDER_CREATED: "true",
    })) {
      db.settings.push({ id: `setting_${key}`, key, value });
    }

    await expect(
      projectStaffNotificationEvent(projectorDb(db), "event_parts", NOW),
    ).resolves.toBe("projected");
    expect(db.staffNotificationReceipts).toHaveLength(1);
    expect(db.staffNotificationReceipts[0]).toMatchObject({ userId: "admin_1" });
    expect(db.staffNotificationDeliveries).toHaveLength(1);
    expect(db.staffNotificationDeliveries[0]).toMatchObject({
      channel: "TELEGRAM",
      destinationKey: "shared_parts",
    });
  });
});

function projectorDb(db: FakeEmailDb): InboundCustomerMessageProjectorDb {
  return db as unknown as InboundCustomerMessageProjectorDb;
}

function eventRecord(): StaffNotificationEventRecord {
  return {
    id: "event_poison",
    tenantKey: TENANT_KEY,
    type: "INBOUND_CUSTOMER_MESSAGE",
    priority: "P0",
    channel: "EMAIL_INBOUND",
    dedupeKey: "inbound-msg:comm_missing",
    sourceType: "CommunicationLog",
    sourceId: "comm_missing",
    relatedCustomerUserId: "customer_1",
    relatedDealId: null,
    relatedTaskId: null,
    targetUserId: null,
    fallbackPermission: "crm.manage",
    summary: "Новое письмо от клиента",
    actionPath: "/admin/customers/customer_1#communication-comm_missing",
    occurredAt: NOW,
    createdAt: NOW,
  };
}

function routableDb(ownerUserId: string | null): FakeEmailDb {
  const db = new FakeEmailDb();
  db.users.push(
    {
      id: "customer_1",
      name: "Клиент",
      permissionRole: "CLIENT",
      deletedAt: null,
    },
    {
      id: "manager_1",
      name: "Менеджер",
      permissionRole: "MANAGER",
      deletedAt: null,
    },
  );
  db.deals.push({ id: "deal_1", ownerUserId, customerUserId: "customer_1" });
  db.communicationLogs.push({
    id: "comm_1",
    customerUserId: "customer_1",
    dealId: "deal_1",
    channel: "EMAIL_INBOUND",
    createdAt: NOW,
  });
  db.staffNotificationEvents.push({
    ...eventRecord(),
    id: "event_route",
    sourceId: "comm_1",
    dedupeKey: "inbound-msg:comm_1",
    relatedDealId: "deal_1",
    routingStatus: "PENDING",
    routingAttempts: 0,
    nextRoutingAt: NOW,
    routedAt: null,
    lastRoutingError: null,
  });
  const settings = {
    TELEGRAM_ENABLED: "true",
    TELEGRAM_ENABLED_AT: NOW.toISOString(),
    TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(32)}`,
    TELEGRAM_BOT_USERNAME: "GeleotekaStaffBot",
    TELEGRAM_WEBHOOK_SECRET: "W".repeat(32),
    TELEGRAM_ROUTING_MODE: "PERSONAL_WITH_SHARED_FALLBACK",
    TELEGRAM_NOTIFY_INBOUND_CUSTOMER_MESSAGE: "true",
  };
  for (const [key, value] of Object.entries(settings)) {
    db.settings.push({ id: `setting_${key}`, key, value });
  }
  return db;
}
