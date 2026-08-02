import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createTelegramChannelAdapter,
  sendTelegramText,
} from "@/lib/staff-notifications/channels/telegram/adapter";
import type { TelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config-values";
import { resolveTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config-values";
import { TELEGRAM_LINK_TOKEN_TTL_MS } from "@/lib/staff-notifications/channels/telegram/constants";
import {
  formatTelegramLinkCommand,
  parseTelegramLinkCommand,
} from "@/lib/staff-notifications/channels/telegram/link-command";
import { getTelegramLinkPanelCopy } from "@/lib/staff-notifications/channels/telegram/link-copy";
import {
  createTelegramLinkToken,
  hashTelegramLinkToken,
  type TelegramLinkDb,
} from "@/lib/staff-notifications/channels/telegram/linking";
import {
  deliverTelegramWebhookReply,
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

describe("Telegram link commands", () => {
  const rawToken = `${"A".repeat(41)}_-`;

  it.each([
    ["a line break", `/start\n${rawToken}`],
    ["multiple spaces", `/start   ${rawToken}`],
    ["a tab", `/start\t${rawToken}`],
    ["surrounding whitespace", ` \n/start ${rawToken}\t `],
    ["a bot username and line break", `/start@GeleotekaStaffBot\n${rawToken}`],
    ["a leading bot mention", `@GeleotekaStaffBot /start ${rawToken}`],
  ])("accepts %s between or around the command", (_case, command) => {
    expect(parseTelegramLinkCommand(command)).toBe(rawToken);
  });

  it.each([
    ["42 characters", "A".repeat(42)],
    ["44 characters", "A".repeat(44)],
    ["an invalid character", `${"A".repeat(42)}!`],
  ])("rejects a token with %s", (_case, token) => {
    expect(parseTelegramLinkCommand(`/start ${token}`)).toBeNull();
  });

  it("parses a formatted command after its separator becomes a line break", () => {
    const receivedCommand = formatTelegramLinkCommand(rawToken).replace(" ", "\n");

    expect(parseTelegramLinkCommand(receivedCommand)).toBe(rawToken);
  });

  it("rejects excessively long input before trimming or parsing it", () => {
    const command = `/start ${rawToken}${" ".repeat(200)}`;
    const trimSpy = vi.spyOn(String.prototype, "trim");

    const result = parseTelegramLinkCommand(command);
    const trimCallCount = trimSpy.mock.calls.length;
    trimSpy.mockRestore();

    expect(result).toBeNull();
    expect(trimCallCount).toBe(0);
  });
});

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
    // Intentional behavior change with the polling switch: a missing or
    // malformed webhook secret no longer disables the channel — inbound goes
    // through getUpdates. It only keeps the webhook route fail-closed.
    expect(
      resolveTelegramRuntimeConfig({
        ...validSettingValues(),
        TELEGRAM_WEBHOOK_SECRET: "short",
      }),
    ).toMatchObject({ enabled: true, webhookSecret: null });
    expect(
      resolveTelegramRuntimeConfig({
        ...validSettingValues(),
        TELEGRAM_API_BASE_URL: "http://insecure-relay.example",
      }),
    ).toMatchObject({ enabled: false, reason: "invalid-config" });
    expect(
      resolveTelegramRuntimeConfig({
        ...validSettingValues(),
        TELEGRAM_API_BASE_URL: "https://relay.example/tg/",
      }),
    ).toMatchObject({ enabled: true, apiBaseUrl: "https://relay.example/tg" });
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
  it("stores only SHA-256 of a 32-byte one-time token with the configured TTL", async () => {
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
    expect(result.manualCommand).toBe(`/start ${rawToken}`);
    expect(parseTelegramLinkCommand(result.manualCommand)).toBe(rawToken);
    expect(created).toMatchObject({
      tokenHash: hashTelegramLinkToken(rawToken!),
      expiresAt: result.expiresAt,
    });
    expect(result.expiresAt.getTime() - NOW.getTime()).toBe(
      TELEGRAM_LINK_TOKEN_TTL_MS,
    );
    expect(JSON.stringify(created)).not.toContain(rawToken!);
  });

  it("derives every interface expiry mention from the token TTL constant", () => {
    const ttlMinutes = TELEGRAM_LINK_TOKEN_TTL_MS / 60_000;
    const copies = [
      getTelegramLinkPanelCopy("PERSONAL"),
      getTelegramLinkPanelCopy("SHARED"),
    ];

    expect(Number.isInteger(ttlMinutes)).toBe(true);
    for (const copy of copies) {
      expect(copy.buttonLabel).toContain(`${ttlMinutes} минут`);
      expect(copy.successMessage).toContain(`${ttlMinutes} минут`);
    }

    for (const relativePath of [
      "components/admin/notifications/TelegramLinkPanel.tsx",
      "lib/staff-notifications/channels/telegram/link-copy.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source).not.toMatch(/\b\d+\s+минут(?:у|ы)?\b/u);
    }
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
    const rawToken = url.searchParams.get("startgroup");

    expect(url.searchParams.get("start")).toBeNull();
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.manualCommand).toBe(`/start ${rawToken}`);
    expect(parseTelegramLinkCommand(result.manualCommand)).toBe(rawToken);
  });
});

describe("Telegram webhook processing", () => {
  it("accepts a formatted link command received with a line break", async () => {
    const rawToken = "N".repeat(43);
    const fake = new FakeTelegramWebhookDb(rawToken);
    const receivedCommand = formatTelegramLinkCommand(rawToken).replace(" ", "\n");

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 8995,
          message: {
            text: receivedCommand,
            chat: { id: 777009995, type: "private" },
            from: { id: 777009995, is_bot: false },
          },
        },
        NOW,
      ),
    ).resolves.toBe("linked");

    expect(fake.destinations).toHaveLength(1);
  });

  it("guides a private chat after a bare /start command", async () => {
    const chatId = 777009990;
    const fake = new FakeTelegramWebhookDb("S".repeat(43));
    const scheduleReply = vi.fn(
      (reply: { chatId: string; text: string }) => {
        expect(fake.transactionActive).toBe(false);
        expect(reply.chatId).toBe(String(chatId));
      },
    );

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 8996,
          message: {
            text: "/start",
            chat: { id: chatId, type: "private" },
            from: { id: chatId, is_bot: false },
          },
        },
        NOW,
        scheduleReply,
      ),
    ).resolves.toBe("ignored");

    expect(scheduleReply).toHaveBeenCalledWith({
      chatId: String(chatId),
      text: expect.stringMatching(
        /личный кабинет.*откройте ссылку заново.*команду привязки/,
      ),
    });
    expect(scheduleReply.mock.calls[0]?.[0].text).not.toContain(String(chatId));
  });

  it("дожидается async-планировщика ответа до возврата (гарантия для polling-обвязки)", async () => {
    const fake = new FakeTelegramWebhookDb("U".repeat(43));
    let replyFinished = false;
    const scheduleReply = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      replyFinished = true;
    });

    await processTelegramWebhookUpdate(
      fake,
      {
        update_id: 8997,
        message: {
          text: "/start",
          chat: { id: 777009991, type: "private" },
          from: { id: 777009991, is_bot: false },
        },
      },
      NOW,
      scheduleReply,
    );

    // В polling-обвязке нет after(): ответ обязан быть доставлен (и его
    // диагностика записана) до завершения drain, а не повиснуть в воздухе.
    expect(replyFinished).toBe(true);
  });

  it("does not reply to a bare /start command in a group", async () => {
    const fake = new FakeTelegramWebhookDb("T".repeat(43));
    const scheduleReply = vi.fn();

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 8997,
          message: {
            text: " \n/start\t ",
            chat: { id: -777009997, type: "group" },
            from: { id: 777009997, is_bot: false },
          },
        },
        NOW,
        scheduleReply,
      ),
    ).resolves.toBe("ignored");

    expect(scheduleReply).not.toHaveBeenCalled();
  });

  it("guides a group after an explicitly addressed /start command", async () => {
    const fake = new FakeTelegramWebhookDb("R".repeat(43));
    const scheduleReply = vi.fn();

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 89972,
          message: {
            text: "/start@GeleotekaStaffBot",
            chat: { id: -777009972, type: "group" },
            from: { id: 1087968824, is_bot: true },
            sender_chat: { id: -777009972, type: "group" },
          },
        },
        NOW,
        scheduleReply,
      ),
    ).resolves.toBe("ignored");

    expect(scheduleReply).toHaveBeenCalledWith({
      chatId: "-777009972",
      text: expect.stringContaining("личный кабинет"),
    });
  });

  it("uses the invalid-link reply for an unrecognized /start tail", async () => {
    const rawTail = "NOT_A_LINK_TOKEN_SENTINEL";
    const fake = new FakeTelegramWebhookDb("W".repeat(43));
    const scheduleReply = vi.fn();

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 89971,
          message: {
            text: `/start ${rawTail}`,
            chat: { id: 777009971, type: "private" },
            from: { id: 777009971, is_bot: false },
          },
        },
        NOW,
        scheduleReply,
      ),
    ).resolves.toBe("invalid-token");

    expect(scheduleReply).toHaveBeenCalledWith({
      chatId: "777009971",
      text: "Ссылка недействительна. Получите новую ссылку в личном кабинете.",
    });
    expect(JSON.stringify(scheduleReply.mock.calls)).not.toContain(rawTail);
  });

  it("does not reply to arbitrary text in a private chat", async () => {
    const fake = new FakeTelegramWebhookDb("V".repeat(43));
    const scheduleReply = vi.fn();

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 8998,
          message: {
            text: "Как подключить уведомления?",
            chat: { id: 777009998, type: "private" },
            from: { id: 777009998, is_bot: false },
          },
        },
        NOW,
        scheduleReply,
      ),
    ).resolves.toBe("ignored");

    expect(scheduleReply).not.toHaveBeenCalled();
  });

  it("schedules a personal-link confirmation to the same chat after commit", async () => {
    const rawToken = "LINK_TOKEN_SENTINEL".padEnd(43, "X");
    const chatId = 777009991;
    const fake = new FakeTelegramWebhookDb(rawToken);
    const scheduleReply = vi.fn(
      (reply: { chatId: string; text: string }) => {
        expect(fake.transactionActive).toBe(false);
        expect(reply.chatId).toBe(String(chatId));
      },
    );

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 8999,
          message: {
            text: `/start ${rawToken}`,
            chat: { id: chatId, type: "private" },
            from: { id: chatId, is_bot: false },
          },
        },
        NOW,
        scheduleReply,
      ),
    ).resolves.toBe("linked");

    expect(scheduleReply).toHaveBeenCalledOnce();
    const replyText = scheduleReply.mock.calls[0]?.[0].text ?? "";
    expect(replyText).toContain("Привязка выполнена");
    expect(replyText).toContain("будут приходить уведомления");
    expect(replyText).not.toContain(rawToken);
    expect(replyText).not.toContain(String(chatId));
  });

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
    const scheduleReply = vi.fn();
    const update = {
      update_id: 9002,
      message: {
        text: `/start ${rawToken}`,
        chat: { id: -10077, type: "supergroup" },
        from: { id: 777002, is_bot: false },
      },
    };

    await expect(
      processTelegramWebhookUpdate(fake, update, NOW, scheduleReply),
    ).resolves.toBe("ignored");
    expect(fake.destinations).toHaveLength(0);
    expect(scheduleReply).toHaveBeenCalledWith({
      chatId: "-10077",
      text: "Ссылка недействительна. Получите новую ссылку в личном кабинете.",
    });
  });

  it("keeps PERSONAL linking closed to a bot sender", async () => {
    const rawToken = "P".repeat(43);
    const fake = new FakeTelegramWebhookDb(rawToken, "PERSONAL");

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 90021,
          message: {
            text: `/start@GeleotekaStaffBot ${rawToken}`,
            chat: { id: 7770021, type: "private" },
            from: { id: 1087968824, is_bot: true },
          },
        },
        NOW,
      ),
    ).resolves.toBe("ignored");

    expect(fake.destinations).toHaveLength(0);
  });

  it("does not link an anonymous group administrator with a PERSONAL token", async () => {
    const rawToken = "Q".repeat(43);
    const fake = new FakeTelegramWebhookDb(rawToken, "PERSONAL");

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 90022,
          message: {
            text: `/start@GeleotekaStaffBot ${rawToken}`,
            chat: { id: -100777022, type: "supergroup" },
            from: { id: 1087968824, is_bot: true },
            sender_chat: { id: -100777022, type: "supergroup" },
          },
        },
        NOW,
      ),
    ).resolves.toBe("ignored");

    expect(fake.destinations).toHaveLength(0);
  });

  it("links an anonymous group administrator with a SHARED token", async () => {
    const rawToken = "H".repeat(43);
    const fake = new FakeTelegramWebhookDb(rawToken, "SHARED");
    const scheduleReply = vi.fn();

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 90023,
          message: {
            text: `/start@GeleotekaStaffBot ${rawToken}`,
            chat: { id: -100777023, type: "supergroup" },
            from: { id: 1087968824, is_bot: true },
            sender_chat: { id: -100777023, type: "supergroup" },
          },
        },
        NOW,
        scheduleReply,
      ),
    ).resolves.toBe("linked");

    expect(fake.destinations).toHaveLength(1);
    expect(fake.destinations[0]).toMatchObject({
      kind: "SHARED",
      userId: null,
      chatId: "-100777023",
      telegramUserId: null,
    });
    expect(scheduleReply).toHaveBeenCalledWith({
      chatId: "-100777023",
      text: expect.stringContaining("общий получатель"),
    });
  });

  it("links a leading-mention command with a SHARED token", async () => {
    const rawToken = "C".repeat(43);
    const fake = new FakeTelegramWebhookDb(rawToken, "SHARED");
    const scheduleReply = vi.fn();
    const update = {
      update_id: 9003,
      message: {
        text: `@GeleotekaStaffBot /start ${rawToken}`,
        chat: { id: -100777003, type: "supergroup" },
        from: { id: 777003, is_bot: false },
      },
    };

    await expect(
      processTelegramWebhookUpdate(fake, update, NOW, scheduleReply),
    ).resolves.toBe("linked");
    expect(fake.destinations).toHaveLength(1);
    expect(fake.destinations[0]).toMatchObject({
      kind: "SHARED",
      userId: null,
      chatId: "-100777003",
      telegramUserId: null,
      deliveryScope: "FALLBACK_ONLY",
    });
    expect(scheduleReply).toHaveBeenCalledWith({
      chatId: "-100777003",
      text: expect.stringContaining("общий получатель"),
    });
  });

  it.each(["expired", "used"] as const)(
    "uses the same invalid-link reply for an %s token",
    async (tokenState) => {
      const rawToken = tokenState === "expired" ? "E".repeat(43) : "U".repeat(43);
      const fake = new FakeTelegramWebhookDb(rawToken);
      if (tokenState === "expired") fake.expireToken();
      else fake.useToken();
      const scheduleReply = vi.fn();

      await expect(
        processTelegramWebhookUpdate(
          fake,
          {
            update_id: tokenState === "expired" ? 9005 : 9006,
            message: {
              text: `/start ${rawToken}`,
              chat: { id: 777005, type: "private" },
              from: { id: 777005, is_bot: false },
            },
          },
          NOW,
          scheduleReply,
        ),
      ).resolves.toBe("expired-token");

      expect(scheduleReply).toHaveBeenCalledWith({
        chatId: "777005",
        text: "Ссылка недействительна. Получите новую ссылку в личном кабинете.",
      });
    },
  );

  it("explains when the chat is already linked to another destination", async () => {
    const rawToken = "F".repeat(43);
    const fake = new FakeTelegramWebhookDb(rawToken);
    fake.destinations.push({
      id: "destination_other",
      tenantKey: TENANT_KEY,
      kind: "SHARED",
      userId: null,
      chatId: "777007",
    });
    const scheduleReply = vi.fn();

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 9007,
          message: {
            text: `/start ${rawToken}`,
            chat: { id: 777007, type: "private" },
            from: { id: 777007, is_bot: false },
          },
        },
        NOW,
        scheduleReply,
      ),
    ).resolves.toBe("destination-conflict");

    expect(scheduleReply).toHaveBeenCalledWith({
      chatId: "777007",
      text: "Этот чат уже используется для другой привязки.",
    });
  });

  it("records a safe reply failure without changing the committed link", async () => {
    const rawToken = "LINK_TOKEN_SENTINEL".padEnd(43, "G");
    const chatId = 777008;
    const fake = new FakeTelegramWebhookDb(rawToken);
    const scheduledReplies: Array<{ chatId: string; text: string }> = [];

    await expect(
      processTelegramWebhookUpdate(
        fake,
        {
          update_id: 9008,
          message: {
            text: `/start ${rawToken}`,
            chat: { id: chatId, type: "private" },
            from: { id: chatId, is_bot: false },
          },
        },
        NOW,
        (reply) => {
          scheduledReplies.push(reply);
        },
      ),
    ).resolves.toBe("linked");

    expect(fake.destinations).toHaveLength(1);
    expect(fake.auditWrites).toBe(1);
    // Advisory-lock обязан идти bigint-параметром: строковый ключ с NUL
    // Postgres отбивал ошибкой 22021, превращая привязку в ядовитый апдейт.
    expect(fake.lockParams).toHaveLength(1);
    expect(typeof fake.lockParams[0]).toBe("bigint");
    await deliverTelegramWebhookReply(
      fake,
      scheduledReplies[0]!,
      vi.fn(async () => ({
        errorCode: "TELEGRAM_RATE_LIMITED" as const,
        httpStatus: 429,
      })),
    );

    expect(fake.destinations).toHaveLength(1);
    expect(fake.auditWrites).toBe(2);
    const failureAudit = fake.auditRows.find(
      (row) => row.action === "telegram.webhook_reply_failed",
    );
    expect(failureAudit).toMatchObject({
      actorUserId: null,
      action: "telegram.webhook_reply_failed",
      targetId: null,
      targetLabel: null,
      metadata: {
        errorCode: "TELEGRAM_RATE_LIMITED",
        httpStatus: 429,
      },
      ip: null,
    });
    const serializedAudit = JSON.stringify(failureAudit);
    expect(serializedAudit).not.toContain(rawToken);
    expect(serializedAudit).not.toContain(String(chatId));
    expect(serializedAudit).not.toContain("Привязка выполнена");
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
  it("sends plain text through the shared Bot API path without parse mode", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) => {
        void _input;
        void _init;
        return Response.json({ ok: true, result: { message_id: 42 } });
      },
    );

    await expect(
      sendTelegramText(fetchMock, {
        apiBaseUrl: "https://api.telegram.org",
        botToken: `123456:${"A".repeat(32)}`,
        chatId: "777001",
        text: "Привязка выполнена.",
      }),
    ).resolves.toMatchObject({ outcome: "response" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "null"),
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      chat_id: "777001",
      text: "Привязка выполнена.",
      protect_content: true,
      link_preview_options: { is_disabled: true },
    });
    expect(body).not.toHaveProperty("parse_mode");
  });

  it("aborts the Bot API call when reading its response body exceeds 10 seconds", async () => {
    vi.useFakeTimers();
    try {
      const requestSignals: AbortSignal[] = [];
      const fetchMock = vi.fn(
        async (_input: string | URL | Request, init?: RequestInit) => {
          if (init?.signal) requestSignals.push(init.signal);
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              init?.signal?.addEventListener(
                "abort",
                () => controller.error(new Error("aborted")),
                { once: true },
              );
            },
          });
          return new Response(stream, {
            headers: { "content-type": "application/json" },
          });
        },
      );

      const result = sendTelegramText(fetchMock, {
        apiBaseUrl: "https://api.telegram.org",
        botToken: `123456:${"A".repeat(32)}`,
        chatId: "777001",
        text: "Привязка выполнена.",
      });
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(result).resolves.toEqual({ outcome: "timeout" });
      expect(requestSignals[0]?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

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

  it("records a successful notification send through the channel adapter", async () => {
    const destinationDb = adapterDb();
    const adapter = createTelegramChannelAdapter({
      db: destinationDb.db,
      fetch: vi.fn(async () =>
        Response.json({ ok: true, result: { message_id: 42 } }),
      ),
      loadConfig: async () => enabledConfig(),
      monotonicNow: (() => {
        const values = [100, 225];
        let index = 0;
        return () => values[index++]!;
      })(),
    });

    await expect(adapter.send("destination_1", safePayload())).resolves.toEqual({
      outcome: "sent",
      providerMessageId: "42",
    });
    expect(destinationDb.diagnostics).toEqual([
      expect.objectContaining({
        operation: "NOTIFICATION_DELIVERY",
        outcome: "SUCCESS",
        durationMs: 125,
        isSlow: false,
        errorCode: null,
      }),
    ]);
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
  const diagnostics: Array<Record<string, unknown>> = [];
  return {
    disable,
    diagnostics,
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
      telegramSendAttempt: {
        create: async (args: Record<string, unknown>) => {
          diagnostics.push((args as { data: Record<string, unknown> }).data);
          return {};
        },
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
  auditRows: Array<Record<string, unknown>> = [];
  auditWrites = 0;
  transactionActive = false;
  private token;

  constructor(rawToken: string, purpose: "PERSONAL" | "SHARED" = "PERSONAL") {
    this.token = {
      id: "link_1",
      tenantKey: TENANT_KEY,
      tokenHash: hashTelegramLinkToken(rawToken),
      userId: purpose === "PERSONAL" ? "manager_1" : null,
      purpose,
      expiresAt: new Date(NOW.getTime() + TELEGRAM_LINK_TOKEN_TTL_MS),
      usedAt: null as Date | null,
      createdByUserId: "manager_1",
    };
  }

  async $transaction<T>(fn: (tx: never) => Promise<T>): Promise<T> {
    this.transactionActive = true;
    try {
      return await fn(this as never);
    } finally {
      this.transactionActive = false;
    }
  }

  expireToken(): void {
    this.token.expiresAt = NOW;
  }

  useToken(): void {
    this.token.usedAt = new Date(NOW.getTime() - 1);
  }

  lockParams: unknown[] = [];

  $executeRaw = async (
    _query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number> => {
    this.lockParams.push(...values);
    return 0;
  };

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
    create: async (args: Record<string, unknown>) => {
      this.auditRows.push(args.data as Record<string, unknown>);
      this.auditWrites += 1;
      return {};
    },
  };
}
