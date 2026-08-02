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
  it("prioritizes the customer's personal manager over the deal owner", async () => {
    const db = routableDb("deal_manager");
    const customer = db.users.find((row) => row.id === "customer_1");
    if (!customer) throw new Error("test customer missing");
    customer.managerUserId = "customer_manager";
    db.users.push(
      {
        id: "deal_manager",
        name: "Владелец сделки",
        permissionRole: "MANAGER",
        deletedAt: null,
      },
      {
        id: "customer_manager",
        name: "Менеджер клиента",
        permissionRole: "MANAGER",
        deletedAt: null,
      },
    );
    db.telegramDestinations.push(
      {
        id: "personal_deal",
        tenantKey: TENANT_KEY,
        kind: "PERSONAL",
        userId: "deal_manager",
        isActive: true,
        disabledAt: null,
      },
      {
        id: "personal_customer",
        tenantKey: TENANT_KEY,
        kind: "PERSONAL",
        userId: "customer_manager",
        isActive: true,
        disabledAt: null,
      },
    );

    await expect(
      projectInboundCustomerMessageEvent(projectorDb(db), "event_route", NOW),
    ).resolves.toBe("projected");

    expect(db.staffNotificationReceipts).toHaveLength(1);
    expect(db.staffNotificationReceipts[0]).toMatchObject({
      userId: "customer_manager",
    });
    expect(db.staffNotificationDeliveries).toHaveLength(1);
    expect(db.staffNotificationDeliveries[0]).toMatchObject({
      destinationKey: "personal_customer",
    });
  });

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

  it("routes an assigned event to its owner and to a shared all-events destination", async () => {
    const db = routableDb("manager_1");
    const routingMode = db.settings.find((row) => row.key === "TELEGRAM_ROUTING_MODE");
    if (!routingMode) throw new Error("test Telegram routing mode missing");
    routingMode.value = "PERSONAL_ONLY";
    db.telegramDestinations.push(
      {
        id: "personal_1",
        tenantKey: TENANT_KEY,
        kind: "PERSONAL",
        userId: "manager_1",
        deliveryScope: "FALLBACK_ONLY",
        isActive: true,
        disabledAt: null,
      },
      {
        id: "shared_all",
        tenantKey: TENANT_KEY,
        kind: "SHARED",
        userId: null,
        deliveryScope: "ALL_EVENTS",
        isActive: true,
        disabledAt: null,
      },
    );

    await expect(
      projectInboundCustomerMessageEvent(projectorDb(db), "event_route", NOW),
    ).resolves.toBe("projected");

    expect(db.staffNotificationReceipts).toHaveLength(1);
    expect(db.staffNotificationReceipts[0]).toMatchObject({ userId: "manager_1" });
    expect(db.staffNotificationDeliveries).toHaveLength(2);
    expect(db.staffNotificationDeliveries.map((row) => row.destinationKey).sort()).toEqual([
      "personal_1",
      "shared_all",
    ]);
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

  it("creates no personal or shared delivery when the event category is disabled", async () => {
    const db = routableDb("manager_1");
    const category = db.settings.find(
      (row) => row.key === "TELEGRAM_NOTIFY_INBOUND_CUSTOMER_MESSAGE",
    );
    if (!category) throw new Error("test Telegram category setting missing");
    category.value = "false";
    db.telegramDestinations.push(
      {
        id: "personal_1",
        tenantKey: TENANT_KEY,
        kind: "PERSONAL",
        userId: "manager_1",
        deliveryScope: "FALLBACK_ONLY",
        isActive: true,
        disabledAt: null,
      },
      {
        id: "shared_all",
        tenantKey: TENANT_KEY,
        kind: "SHARED",
        userId: null,
        deliveryScope: "ALL_EVENTS",
        isActive: true,
        disabledAt: null,
      },
    );

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

  it("routes TASK_ASSIGNED only to the task owner's personal destination", async () => {
    const db = new FakeEmailDb();
    db.users.push(
      {
        id: "manager_1",
        name: "Постановщик",
        permissionRole: "MANAGER",
        deletedAt: null,
      },
      {
        id: "manager_2",
        name: "Исполнитель",
        permissionRole: "MANAGER",
        deletedAt: null,
      },
    );
    db.staffNotificationEvents.push({
      ...eventRecord(),
      id: "event_task_assigned",
      type: "TASK_ASSIGNED",
      priority: "P1",
      channel: null,
      dedupeKey: "task-assigned:task_1:manager_2",
      sourceType: "CrmTask",
      sourceId: "task_1",
      relatedCustomerUserId: "customer_1",
      relatedDealId: null,
      relatedTaskId: "task_1",
      targetUserId: "manager_2",
      fallbackPermission: "crm.manage",
      routingStatus: "PENDING",
      routingAttempts: 0,
      nextRoutingAt: NOW,
      routedAt: null,
      lastRoutingError: null,
    });
    db.telegramDestinations.push(
      {
        id: "personal_1",
        tenantKey: TENANT_KEY,
        kind: "PERSONAL",
        userId: "manager_1",
        isActive: true,
        disabledAt: null,
      },
      {
        id: "personal_2",
        tenantKey: TENANT_KEY,
        kind: "PERSONAL",
        userId: "manager_2",
        isActive: true,
        disabledAt: null,
      },
    );
    for (const [key, value] of Object.entries({
      TELEGRAM_ENABLED: "true",
      TELEGRAM_ENABLED_AT: NOW.toISOString(),
      TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(32)}`,
      TELEGRAM_BOT_USERNAME: "GeleotekaStaffBot",
      TELEGRAM_WEBHOOK_SECRET: "W".repeat(32),
      TELEGRAM_ROUTING_MODE: "PERSONAL_WITH_SHARED_FALLBACK",
      TELEGRAM_NOTIFY_TASK_ASSIGNED: "true",
    })) {
      db.settings.push({ id: `setting_${key}`, key, value });
    }

    await expect(
      projectStaffNotificationEvent(db as unknown as InboundCustomerMessageProjectorDb, "event_task_assigned", NOW),
    ).resolves.toBe("projected");

    expect(db.staffNotificationReceipts).toHaveLength(1);
    expect(db.staffNotificationReceipts[0]).toMatchObject({ userId: "manager_2" });
    expect(db.staffNotificationDeliveries).toHaveLength(1);
    expect(db.staffNotificationDeliveries[0]).toMatchObject({
      destinationKey: "personal_2",
    });
  });

  it.each([
    {
      type: "USER_LOGIN",
      sourceType: "User",
      sourceId: "client_1",
      dedupeKey: "user-login:client_1:audit_1",
      fallbackPermission: "users.manage",
    },
    {
      type: "TASK_CREATED",
      sourceType: "CrmTask",
      sourceId: "task_1",
      dedupeKey: "task-created:task_1",
      fallbackPermission: "crm.manage",
    },
  ])("routes $type through fallbackPermission to a shared destination", async (input) => {
    const db = new FakeEmailDb();
    db.users.push({
      id: "admin_1",
      name: "Администратор",
      permissionRole: "ADMIN",
      deletedAt: null,
    });
    db.staffNotificationEvents.push({
      ...eventRecord(),
      id: `event_${input.type}`,
      type: input.type,
      priority: input.type === "USER_LOGIN" ? "P2" : "P1",
      channel: null,
      dedupeKey: input.dedupeKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      relatedTaskId: input.type === "TASK_CREATED" ? input.sourceId : null,
      targetUserId: null,
      fallbackPermission: input.fallbackPermission,
      routingStatus: "PENDING",
      routingAttempts: 0,
      nextRoutingAt: NOW,
      routedAt: null,
      lastRoutingError: null,
    });
    db.telegramDestinations.push({
      id: "shared_story_4",
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
      [`TELEGRAM_NOTIFY_${input.type}`]: "true",
    })) {
      db.settings.push({ id: `setting_${key}`, key, value });
    }

    await expect(
      projectStaffNotificationEvent(
        db as unknown as InboundCustomerMessageProjectorDb,
        `event_${input.type}`,
        NOW,
      ),
    ).resolves.toBe("projected");

    expect(db.staffNotificationReceipts).toHaveLength(1);
    expect(db.staffNotificationReceipts[0]).toMatchObject({ userId: "admin_1" });
    expect(db.staffNotificationDeliveries).toHaveLength(1);
    expect(db.staffNotificationDeliveries[0]).toMatchObject({
      destinationKey: "shared_story_4",
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
