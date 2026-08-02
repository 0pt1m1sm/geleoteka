import { describe, expect, it, vi } from "vitest";

import { createTelegramChannelAdapter } from "@/lib/staff-notifications/channels/telegram/adapter";
import type { TelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config-values";
import { resolveTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config-values";
import {
  createTelegramLinkToken,
  hashTelegramLinkToken,
  type TelegramLinkDb,
} from "@/lib/staff-notifications/channels/telegram/linking";
import {
  processTelegramWebhookUpdate,
  type TelegramWebhookDb,
} from "@/lib/staff-notifications/channels/telegram/webhook";
import {
  dispatchLeasedStaffNotification,
  type LeasedStaffDelivery,
  type StaffNotificationDispatcherDb,
} from "@/lib/staff-notifications/dispatcher";
import type { StaffNotificationChannelRegistry } from "@/lib/staff-notifications/channels";
import {
  STAFF_NOTIFICATION_EVENT_CATALOG,
  type SafeChannelPayload,
} from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";
import { validateSettingValue } from "@/lib/settings-validation";

const NOW = new Date("2026-08-01T12:00:00.000Z");

describe("Telegram runtime config", () => {
  it("has human-readable labels for every notification category", () => {
    expect(
      Object.fromEntries(
        Object.entries(STAFF_NOTIFICATION_EVENT_CATALOG).map(([type, definition]) => [
          type,
          definition.label,
        ]),
      ),
    ).toEqual({
      INBOUND_CUSTOMER_MESSAGE: "Клиент написал",
      SERVICE_BOOKING_CREATED: "Новая запись на сервис",
      ESTIMATE_CUSTOMER_APPROVED: "Клиент согласовал смету",
      ESTIMATE_CUSTOMER_DECLINED: "Клиент отклонил смету",
      PARTS_ORDER_CREATED: "Заказ запчастей",
      RENTAL_BOOKING_CREATED: "Бронь аренды",
      INBOUND_MESSAGE_UNRESOLVED: "Сообщение не разобрано",
      CRM_TASK_OVERDUE: "Просроченная задача",
      STAFF_DELIVERY_DEAD: "Доставка не прошла",
    });
  });

  it("fails closed when the master flag or any required secret is missing or malformed", () => {
    expect(resolveTelegramRuntimeConfig({})).toMatchObject({ enabled: false });
    expect(
      resolveTelegramRuntimeConfig({
        ...validSettingValues(),
        TELEGRAM_BOT_TOKEN: "damaged",
      }),
    ).toMatchObject({ enabled: false, reason: "invalid-config" });
    expect(
      resolveTelegramRuntimeConfig({
        ...validSettingValues(),
        TELEGRAM_WEBHOOK_SECRET: "short",
      }),
    ).toMatchObject({ enabled: false, reason: "invalid-config" });
    expect(
      resolveTelegramRuntimeConfig({
        ...validSettingValues(),
        TELEGRAM_ENABLED_AT: "not-a-cutover",
      }),
    ).toMatchObject({ enabled: false, reason: "invalid-config" });
  });

  it("enables only canonical true event switches", () => {
    const config = resolveTelegramRuntimeConfig({
      ...validSettingValues(),
      TELEGRAM_NOTIFY_INBOUND_CUSTOMER_MESSAGE: " true ",
      TELEGRAM_NOTIFY_SERVICE_BOOKING_CREATED: "yes",
    });
    expect(config.enabled).toBe(true);
    expect(config.enabledEventTypes.has("INBOUND_CUSTOMER_MESSAGE")).toBe(true);
    expect(config.enabledEventTypes.has("SERVICE_BOOKING_CREATED")).toBe(false);
  });
});

describe("setting descriptor validation", () => {
  it("rejects forged boolean and select values on the server", () => {
    expect(
      validateSettingValue(
        { key: "FLAG", label: "Flag", group: "Test", input: "boolean" },
        "yes",
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateSettingValue(
        {
          key: "MODE",
          label: "Mode",
          group: "Test",
          input: "select",
          options: [{ value: "SAFE", label: "Safe" }],
        },
        "UNSAFE",
      ),
    ).toMatchObject({ ok: false });
  });

  it("rejects a malformed Telegram secret without echoing it", () => {
    const malformed = "damaged-secret";
    const result = validateSettingValue(
      {
        key: "TELEGRAM_BOT_TOKEN",
        label: "Bot API token",
        group: "Telegram",
        input: "secret",
        secret: true,
      },
      malformed,
    );
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain(malformed);
  });

  it("accepts only bounded integer retention days", () => {
    const descriptor = {
      key: "STAFF_NOTIFICATION_RETENTION_DAYS",
      label: "Retention",
      group: "Telegram",
      input: "text" as const,
    };
    expect(validateSettingValue(descriptor, "90")).toEqual({
      ok: true,
      value: "90",
    });
    expect(validateSettingValue(descriptor, "0")).toMatchObject({ ok: false });
    expect(validateSettingValue(descriptor, "30.5")).toMatchObject({ ok: false });
  });
});

describe("Telegram link tokens", () => {
  it("stores only SHA-256 of a 32-byte one-time token with a ten-minute TTL", async () => {
    let created: Record<string, unknown> | null = null;
    const client: TelegramLinkDb = {
      async $transaction(fn) {
        return fn({
          telegramLinkToken: {
            updateMany: async () => ({ count: 0 }),
            create: async (args) => {
              created = (args as { data: Record<string, unknown> }).data;
              return created;
            },
          },
        });
      },
    };

    const result = await createTelegramLinkToken(client, {
      purpose: "PERSONAL",
      userId: "manager_1",
      createdByUserId: "manager_1",
      botUsername: "GeleotekaStaffBot",
      now: NOW,
    });
    const rawToken = new URL(result.deepLink).searchParams.get("start");

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created).toMatchObject({
      tokenHash: hashTelegramLinkToken(rawToken!),
      expiresAt: new Date("2026-08-01T12:10:00.000Z"),
    });
    expect(JSON.stringify(created)).not.toContain(rawToken!);
  });

  it("uses Telegram startgroup for a shared destination", async () => {
    const client: TelegramLinkDb = {
      async $transaction(fn) {
        return fn({
          telegramLinkToken: {
            updateMany: async () => ({ count: 0 }),
            create: async () => ({}),
          },
        });
      },
    };

    const result = await createTelegramLinkToken(client, {
      purpose: "SHARED",
      userId: null,
      createdByUserId: "admin_1",
      botUsername: "GeleotekaStaffBot",
      now: NOW,
    });
    const url = new URL(result.deepLink);

    expect(url.searchParams.get("start")).toBeNull();
    expect(url.searchParams.get("startgroup")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("Telegram webhook processing", () => {
  it("processes a repeated update_id only once", async () => {
    const rawToken = "A".repeat(43);
    const fake = new FakeTelegramWebhookDb(rawToken);
    const update = {
      update_id: 9001,
      message: {
        text: `/start ${rawToken}`,
        chat: { id: 777001, type: "private" },
        from: { id: 777001, is_bot: false },
      },
    };

    await expect(processTelegramWebhookUpdate(fake, update, NOW)).resolves.toBe("linked");
    await expect(processTelegramWebhookUpdate(fake, update, NOW)).resolves.toBe("duplicate");
    expect(fake.destinations).toHaveLength(1);
    expect(fake.auditWrites).toBe(1);
  });

  it("never links a group with a PERSONAL token", async () => {
    const rawToken = "B".repeat(43);
    const fake = new FakeTelegramWebhookDb(rawToken);
    const update = {
      update_id: 9002,
      message: {
        text: `/start ${rawToken}`,
        chat: { id: -10077, type: "supergroup" },
        from: { id: 777002, is_bot: false },
      },
    };

    await expect(processTelegramWebhookUpdate(fake, update, NOW)).resolves.toBe("ignored");
    expect(fake.destinations).toHaveLength(0);
  });

  it("links a supergroup with a SHARED token and keeps fallback scope by default", async () => {
    const rawToken = "C".repeat(43);
    const fake = new FakeTelegramWebhookDb(rawToken, "SHARED");
    const update = {
      update_id: 9003,
      message: {
        text: `/start@GeleotekaStaffBot ${rawToken}`,
        chat: { id: -100777003, type: "supergroup" },
        from: { id: 777003, is_bot: false },
      },
    };

    await expect(processTelegramWebhookUpdate(fake, update, NOW)).resolves.toBe("linked");
    expect(fake.destinations).toHaveLength(1);
    expect(fake.destinations[0]).toMatchObject({
      kind: "SHARED",
      userId: null,
      chatId: "-100777003",
      deliveryScope: "FALLBACK_ONLY",
    });
  });

  it("updates the shared destination on a migrate_to_chat_id service message", async () => {
    const fake = new FakeTelegramWebhookDb("D".repeat(43), "SHARED");
    fake.destinations.push({
      id: "destination_1",
      tenantKey: TENANT_KEY,
      kind: "SHARED",
      userId: null,
      chatId: "-777004",
      deliveryScope: "ALL_EVENTS",
    });
    const update = {
      update_id: 9004,
      message: {
        chat: { id: -777004, type: "group" },
        migrate_to_chat_id: -100777004,
      },
    };

    await expect(processTelegramWebhookUpdate(fake, update, NOW)).resolves.toBe("migrated");
    expect(fake.destinations[0]).toMatchObject({
      chatId: "-100777004",
      deliveryScope: "ALL_EVENTS",
    });
  });
});

describe("Telegram delivery classification", () => {
  it("performs no HTTP when Telegram is disabled or malformed", async () => {
    const destinationDb = adapterDb();
    const fetchMock = vi.fn<typeof fetch>();
    const malformedConfig = resolveTelegramRuntimeConfig({
      ...validSettingValues(),
      TELEGRAM_BOT_TOKEN: "damaged",
      TELEGRAM_NOTIFY_INBOUND_CUSTOMER_MESSAGE: "true",
    });
    const adapter = createTelegramChannelAdapter({
      db: destinationDb.db,
      fetch: fetchMock,
      loadConfig: async () => malformedConfig,
    });

    await expect(adapter.send("destination_1", safePayload())).resolves.toMatchObject({
      outcome: "retry",
      errorCode: "TELEGRAM_DISABLED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("performs no HTTP for an event before the channel cutover", async () => {
    const destinationDb = adapterDb();
    const fetchMock = vi.fn<typeof fetch>();
    const adapter = createTelegramChannelAdapter({
      db: destinationDb.db,
      fetch: fetchMock,
      loadConfig: async () => enabledConfig(),
    });

    await expect(
      adapter.send("destination_1", {
        ...safePayload(),
        occurredAt: new Date(NOW.getTime() - 1),
      }),
    ).resolves.toEqual({
      outcome: "dead",
      errorCode: "EVENT_BEFORE_CHANNEL_CUTOVER",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, "Bad Request: chat not found", "TELEGRAM_CHAT_NOT_FOUND"],
    [403, "Forbidden: bot was blocked by the user", "TELEGRAM_BOT_BLOCKED"],
  ])("disables the destination and marks delivery DEAD for permanent %s", async (status, description, code) => {
    const destinationDb = adapterDb();
    const adapter = createTelegramChannelAdapter({
      db: destinationDb.db,
      fetch: vi.fn(async () =>
        Response.json(
          { ok: false, error_code: status, description },
          { status },
        ),
      ),
      loadConfig: async () => enabledConfig(),
      now: () => NOW,
    });
    const deliveryUpdate = vi.fn(async () => ({ count: 1 }));
    const client = dispatcherClient(deliveryUpdate);

    await expect(
      dispatchLeasedStaffNotification(
        client,
        leasedDelivery(),
        { TELEGRAM: adapter } satisfies StaffNotificationChannelRegistry,
        NOW,
      ),
    ).resolves.toBe("dead");

    expect(destinationDb.disable).toHaveBeenCalledOnce();
    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DEAD", lastErrorCode: code }),
      }),
    );
  });

  it("honours Telegram retry_after when it is longer than the local schedule", async () => {
    const destinationDb = adapterDb();
    const adapter = createTelegramChannelAdapter({
      db: destinationDb.db,
      fetch: vi.fn(async () =>
        Response.json(
          {
            ok: false,
            error_code: 429,
            description: "Too Many Requests",
            parameters: { retry_after: 125 },
          },
          { status: 429 },
        ),
      ),
      loadConfig: async () => enabledConfig(),
    });
    const deliveryUpdate = vi.fn(async () => ({ count: 1 }));

    await expect(
      dispatchLeasedStaffNotification(
        dispatcherClient(deliveryUpdate),
        leasedDelivery(),
        { TELEGRAM: adapter },
        NOW,
      ),
    ).resolves.toBe("retry");
    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "RETRY",
          nextAttemptAt: new Date("2026-08-01T12:02:05.000Z"),
          lastErrorCode: "TELEGRAM_RATE_LIMITED",
        }),
      }),
    );
  });

  it("updates the destination when Bot API returns migrate_to_chat_id", async () => {
    const destinationDb = adapterDb();
    const adapter = createTelegramChannelAdapter({
      db: destinationDb.db,
      fetch: vi.fn(async () =>
        Response.json(
          {
            ok: false,
            error_code: 400,
            description: "Bad Request: group chat was upgraded to a supergroup chat",
            parameters: { migrate_to_chat_id: -100777005 },
          },
          { status: 400 },
        ),
      ),
      loadConfig: async () => enabledConfig(),
    });

    await expect(adapter.send("destination_1", safePayload())).resolves.toEqual({
      outcome: "retry",
      errorCode: "TELEGRAM_CHAT_MIGRATED",
    });
    expect(destinationDb.disable).toHaveBeenCalledWith({
      where: {
        tenantKey: TENANT_KEY,
        id: "destination_1",
        chatId: "777001",
      },
      data: { chatId: "-100777005" },
    });
  });

  it("does not copy provider error text into delivery errors or logs", async () => {
    const claimToken = "claimToken-SENTINEL-never-leak";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const destinationDb = adapterDb();
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
      void _input;
      void _init;
      return Response.json(
        { ok: false, error_code: 500, description: `provider ${claimToken}` },
        { status: 500 },
      );
    });
    const adapter = createTelegramChannelAdapter({
      db: destinationDb.db,
      fetch: fetchMock,
      loadConfig: async () => enabledConfig(),
    });

    const result = await adapter.send("destination_1", safePayload());
    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
    const logs = JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls]);

    expect(requestBody).not.toContain(claimToken);
    expect(JSON.stringify(result)).not.toContain(claimToken);
    expect(logs).not.toContain(claimToken);
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});

function validSettingValues(): Record<string, string> {
  return {
    TELEGRAM_ENABLED: "true",
    TELEGRAM_ENABLED_AT: NOW.toISOString(),
    TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(32)}`,
    TELEGRAM_BOT_USERNAME: "GeleotekaStaffBot",
    TELEGRAM_WEBHOOK_SECRET: "W".repeat(32),
    TELEGRAM_ROUTING_MODE: "PERSONAL_WITH_SHARED_FALLBACK",
  };
}

function enabledConfig(): TelegramRuntimeConfig {
  const config = resolveTelegramRuntimeConfig({
    ...validSettingValues(),
    TELEGRAM_NOTIFY_INBOUND_CUSTOMER_MESSAGE: "true",
  });
  if (!config.enabled) throw new Error("test config must be enabled");
  return config;
}

function adapterDb() {
  const disable = vi.fn(async () => ({ count: 1 }));
  return {
    disable,
    db: {
      telegramDestination: {
        findUnique: async () => ({
          id: "destination_1",
          chatId: "777001",
          isActive: true,
          disabledAt: null,
        }),
        updateMany: disable,
      },
    },
  };
}

function dispatcherClient(
  updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>,
): StaffNotificationDispatcherDb {
  return {
    $transaction: async () => {
      throw new Error("not used");
    },
    staffNotificationDelivery: { updateMany },
  };
}

function safePayload(): SafeChannelPayload {
  return {
    eventId: "event_1",
    type: "INBOUND_CUSTOMER_MESSAGE",
    priority: "P0",
    safeSummary: "Новое письмо от клиента\nЕгор Атюков",
    occurredAt: NOW,
    actionUrl: "/admin/crm/deals/deal_1042",
  };
}

function leasedDelivery(): LeasedStaffDelivery {
  return {
    deliveryId: "delivery_1",
    tenantKey: TENANT_KEY,
    channel: "TELEGRAM",
    destinationKey: "destination_1",
    attempts: 1,
    leaseOwner: "worker_1",
    leaseUntil: new Date("2026-08-01T12:00:30.000Z"),
    event: {
      id: "event_1",
      tenantKey: TENANT_KEY,
      type: "INBOUND_CUSTOMER_MESSAGE",
      priority: "P0",
      channel: "EMAIL_INBOUND",
      dedupeKey: "inbound-msg:comm_1",
      sourceType: "CommunicationLog",
      sourceId: "comm_1",
      relatedCustomerUserId: "customer_1",
      relatedDealId: "deal_1042",
      relatedTaskId: "task_1",
      targetUserId: "manager_1",
      fallbackPermission: "crm.manage",
      summary: safePayload().safeSummary,
      actionPath: safePayload().actionUrl,
      occurredAt: NOW,
      createdAt: NOW,
    },
  };
}

class FakeTelegramWebhookDb implements TelegramWebhookDb {
  receipts = new Set<string>();
  destinations: Array<Record<string, unknown>> = [];
  auditWrites = 0;
  private token;

  constructor(rawToken: string, purpose: "PERSONAL" | "SHARED" = "PERSONAL") {
    this.token = {
      id: "link_1",
      tenantKey: TENANT_KEY,
      tokenHash: hashTelegramLinkToken(rawToken),
      userId: purpose === "PERSONAL" ? "manager_1" : null,
      purpose,
      expiresAt: new Date("2026-08-01T12:10:00.000Z"),
      usedAt: null as Date | null,
      createdByUserId: "manager_1",
    };
  }

  async $transaction<T>(fn: (tx: never) => Promise<T>): Promise<T> {
    return fn(this as never);
  }

  $queryRaw = async <T>(): Promise<T> => [{ locked: true }] as T;

  telegramUpdateReceipt = {
    createMany: async (args: Record<string, unknown>) => {
      const row = (args.data as Array<{ updateId: string }>)[0];
      if (this.receipts.has(row.updateId)) return { count: 0 };
      this.receipts.add(row.updateId);
      return { count: 1 };
    },
  };

  telegramLinkToken = {
    findUnique: async (args: Record<string, unknown>) => {
      const hash = ((args.where as Record<string, unknown>).tenantKey_tokenHash as Record<string, unknown>).tokenHash;
      return hash === this.token.tokenHash ? this.token : null;
    },
    updateMany: async () => {
      if (this.token.usedAt) return { count: 0 };
      this.token.usedAt = NOW;
      return { count: 1 };
    },
  };

  telegramDestination = {
    findUnique: async (args: Record<string, unknown>) => {
      const chatId = ((args.where as Record<string, unknown>).tenantKey_chatId as Record<string, unknown>).chatId;
      return this.destinations.find((row) => row.chatId === chatId) ?? null;
    },
    findFirst: async () => this.destinations[0] ?? null,
    create: async (args: Record<string, unknown>) => {
      const row = { id: "destination_1", ...(args.data as Record<string, unknown>) };
      this.destinations.push(row);
      return { id: row.id };
    },
    update: async (args: Record<string, unknown>) => {
      Object.assign(this.destinations[0], args.data as Record<string, unknown>);
      return { id: this.destinations[0].id };
    },
    updateMany: async (args: Record<string, unknown>) => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      const rows = this.destinations.filter(
        (row) =>
          (where.tenantKey === undefined || row.tenantKey === where.tenantKey) &&
          (where.kind === undefined || row.kind === where.kind) &&
          (where.chatId === undefined || row.chatId === where.chatId),
      );
      for (const row of rows) Object.assign(row, args.data as Record<string, unknown>);
      return { count: rows.length };
    },
  };

  user = {
    findUnique: async () => ({ id: "manager_1", name: "Менеджер", permissionRole: "MANAGER" }),
  };

  auditLog = {
    create: async () => {
      this.auditWrites += 1;
      return {};
    },
  };
}
