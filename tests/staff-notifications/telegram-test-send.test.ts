import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { TelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config-values";
import {
  TELEGRAM_SEND_TIMEOUT_MS,
  TELEGRAM_TEST_SEND_COOLDOWN_MS,
} from "@/lib/staff-notifications/channels/telegram/constants";
import { getTelegramTestResultCopy } from "@/lib/staff-notifications/channels/telegram/test-copy";
import {
  sendTelegramTestNotification,
  TELEGRAM_TEST_NOTIFICATION_TEXT,
  type TelegramTestSendDb,
} from "@/lib/staff-notifications/channels/telegram/test-send";

const NOW = new Date("2026-08-02T12:00:00.000Z");

describe("Telegram test notification", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a confirmed success with the measured duration and records it as a test", async () => {
    const fake = new FakeTelegramTestDb();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true, result: { message_id: 42 } }),
    );

    const result = await sendTelegramTestNotification({
      client: fake,
      fetchImpl,
      config: enabledConfig(),
      actorUserId: "manager_1",
      target: "PERSONAL",
      monotonicNow: sequenceClock(100, 247),
    });

    expect(result).toEqual({ outcome: "sent", durationMs: 147 });
    expect(getTelegramTestResultCopy(result)).toEqual({
      variant: "success",
      title: "Тест доставлен",
      message: "Telegram подтвердил отправку тестового уведомления за 147 мс.",
    });
    expect(fake.destinationQuery).toMatchObject({
      where: {
        kind: "PERSONAL",
        userId: "manager_1",
        isActive: true,
        disabledAt: null,
      },
      select: { chatId: true },
    });
    expect(fake.diagnostics).toEqual([
      expect.objectContaining({
        operation: "TEST_NOTIFICATION",
        outcome: "SUCCESS",
        durationMs: 147,
        errorCode: null,
      }),
    ]);

    const requestBody = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body ?? "null"),
    ) as Record<string, unknown>;
    expect(requestBody.text).toBe(TELEGRAM_TEST_NOTIFICATION_TEXT);
    expect(requestBody.text).toMatch(/ТЕСТОВОЕ.*Бизнес-событие не произошло/su);
  });

  it("keeps a network refusal as a visible failure code instead of reporting success", async () => {
    const fake = new FakeTelegramTestDb();
    const result = await sendTelegramTestNotification({
      client: fake,
      fetchImpl: vi.fn<typeof fetch>(async () => {
        throw new Error("connection failed");
      }),
      config: enabledConfig(),
      actorUserId: "manager_2",
      target: "PERSONAL",
      monotonicNow: sequenceClock(1_000, 1_321),
    });

    expect(result).toEqual({
      outcome: "failed",
      durationMs: 321,
      errorCode: "TELEGRAM_NETWORK",
    });
    expect(getTelegramTestResultCopy(result)).toMatchObject({
      variant: "error",
      title: "Тест не доставлен",
      message: expect.stringContaining("TELEGRAM_NETWORK"),
    });
    expect(fake.diagnostics).toEqual([
      expect.objectContaining({
        operation: "TEST_NOTIFICATION",
        outcome: "FAILURE",
        durationMs: 321,
        errorCode: "TELEGRAM_NETWORK",
      }),
    ]);
  });

  it("returns an explicit timeout even when the transport ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const fake = new FakeTelegramTestDb();
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined));
    const pending = sendTelegramTestNotification({
      client: fake,
      fetchImpl,
      config: enabledConfig(),
      actorUserId: "manager_3",
      target: "PERSONAL",
      monotonicNow: sequenceClock(0, TELEGRAM_SEND_TIMEOUT_MS),
    });

    for (let turn = 0; turn < 10 && fetchImpl.mock.calls.length === 0; turn += 1) {
      await Promise.resolve();
    }
    expect(fetchImpl).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(TELEGRAM_SEND_TIMEOUT_MS);

    const result = await pending;
    expect(result).toEqual({
      outcome: "failed",
      durationMs: TELEGRAM_SEND_TIMEOUT_MS,
      errorCode: "TELEGRAM_TIMEOUT",
    });
    expect(getTelegramTestResultCopy(result)).toMatchObject({
      variant: "error",
      title: "Доставка не подтверждена",
      message: expect.stringMatching(/10 секунд.*могло дойти.*TELEGRAM_TIMEOUT/su),
    });
    expect(fake.diagnostics[0]).toMatchObject({
      operation: "TEST_NOTIFICATION",
      outcome: "FAILURE",
      errorCode: "TELEGRAM_TIMEOUT",
    });
  });

  it("allows only one test per actor per minute", async () => {
    const fake = new FakeTelegramTestDb();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true, result: { message_id: 42 } }),
    );

    await expect(
      sendTelegramTestNotification({
        client: fake,
        fetchImpl,
        config: enabledConfig(),
        actorUserId: "manager_4",
        target: "PERSONAL",
      }),
    ).resolves.toMatchObject({ outcome: "sent" });
    const limited = await sendTelegramTestNotification({
      client: fake,
      fetchImpl,
      config: enabledConfig(),
      actorUserId: "manager_4",
      target: "PERSONAL",
    });

    expect(limited).toEqual({
      outcome: "rate-limited",
      retryAfterMs: TELEGRAM_TEST_SEND_COOLDOWN_MS,
      errorCode: "TELEGRAM_TEST_RATE_LIMITED",
    });
    expect(getTelegramTestResultCopy(limited).message).toContain("60 сек");
    expect(fetchImpl).toHaveBeenCalledOnce();

    fake.advance(TELEGRAM_TEST_SEND_COOLDOWN_MS);
    await expect(
      sendTelegramTestNotification({
        client: fake,
        fetchImpl,
        config: enabledConfig(),
        actorUserId: "manager_4",
        target: "PERSONAL",
      }),
    ).resolves.toMatchObject({ outcome: "sent" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not send or consume the throttle when the actor has no personal link", async () => {
    const fake = new FakeTelegramTestDb();
    fake.destination = null;
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await sendTelegramTestNotification({
      client: fake,
      fetchImpl,
      config: enabledConfig(),
      actorUserId: "unlinked_user",
      target: "PERSONAL",
    });

    expect(result).toEqual({
      outcome: "failed",
      durationMs: 0,
      errorCode: "TELEGRAM_DESTINATION_UNAVAILABLE",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fake.throttleQueries).toBe(0);
    expect(fake.diagnostics).toEqual([]);

    const profileSource = readFileSync(
      join(process.cwd(), "app/profile/page.tsx"),
      "utf8",
    );
    const linkedBranchStart = profileSource.indexOf("{personalTelegram ? (");
    const unlinkedBranchStart = profileSource.indexOf(") : (", linkedBranchStart);
    expect(linkedBranchStart).toBeGreaterThan(-1);
    expect(unlinkedBranchStart).toBeGreaterThan(linkedBranchStart);
    expect(
      profileSource.slice(linkedBranchStart, unlinkedBranchStart),
    ).toContain('<TelegramTestButton purpose="PERSONAL" />');
    expect(profileSource.slice(unlinkedBranchStart)).not.toContain(
      '<TelegramTestButton purpose="PERSONAL" />',
    );
  });

  it("selects the shared destination server-side for the administrative test", async () => {
    const fake = new FakeTelegramTestDb();
    await sendTelegramTestNotification({
      client: fake,
      fetchImpl: vi.fn<typeof fetch>(async () =>
        Response.json({ ok: true, result: { message_id: 42 } }),
      ),
      config: enabledConfig(),
      actorUserId: "admin_1",
      target: "SHARED",
    });

    expect(fake.destinationQuery).toMatchObject({
      where: { kind: "SHARED", userId: null },
    });
  });
});

class FakeTelegramTestDb implements TelegramTestSendDb {
  destination: { chatId: string } | null = { chatId: "777001" };
  destinationQuery: Record<string, unknown> | null = null;
  diagnostics: Array<Record<string, unknown>> = [];
  throttleQueries = 0;
  private nowMs = NOW.getTime();
  private readonly attemptedAtByActor = new Map<string, number>();

  telegramDestination = {
    findFirst: async (args: Record<string, unknown>) => {
      this.destinationQuery = args;
      return this.destination;
    },
  };

  telegramSendAttempt = {
    create: async (args: Record<string, unknown>) => {
      this.diagnostics.push((args as { data: Record<string, unknown> }).data);
      return {};
    },
  };

  async $queryRaw<T>(
    _query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T> {
    this.throttleQueries += 1;
    const actorUserId = String(values[1]);
    const previous = this.attemptedAtByActor.get(actorUserId);
    if (
      previous === undefined ||
      this.nowMs - previous >= TELEGRAM_TEST_SEND_COOLDOWN_MS
    ) {
      this.attemptedAtByActor.set(actorUserId, this.nowMs);
      return [{ acquired: true, retryAfterMs: 0 }] as T;
    }
    return [
      {
        acquired: false,
        retryAfterMs: TELEGRAM_TEST_SEND_COOLDOWN_MS - (this.nowMs - previous),
      },
    ] as T;
  }

  advance(durationMs: number): void {
    this.nowMs += durationMs;
  }
}

function enabledConfig(): TelegramRuntimeConfig {
  return {
    enabled: true,
    enabledAt: NOW,
    botToken: `123456:${"A".repeat(32)}`,
    botUsername: "GeleotekaStaffBot",
    webhookSecret: "S".repeat(32),
    routingMode: "PERSONAL_ONLY",
    applicationOrigin: "https://geleoteka.ru",
    enabledEventTypes: new Set(),
  };
}

function sequenceClock(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}
