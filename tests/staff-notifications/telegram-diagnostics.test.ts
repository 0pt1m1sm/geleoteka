import { describe, expect, it, vi } from "vitest";

import { sendTelegramTextWithDiagnostics } from "@/lib/staff-notifications/channels/telegram/adapter";
import {
  retainTelegramSendAttempts,
  TELEGRAM_SLOW_SEND_THRESHOLD_MS,
  type TelegramSendDiagnosticsRetentionDb,
  type TelegramSendDiagnosticsWriteDb,
} from "@/lib/staff-notifications/channels/telegram/diagnostics";

describe("Telegram outbound diagnostics", () => {
  it("records duration and outcome for a successful notification send", async () => {
    const recorder = recordingDb();

    await expect(
      sendTelegramTextWithDiagnostics({
        client: recorder.db,
        fetchImpl: successfulFetch(),
        message: safeMessage(),
        operation: "NOTIFICATION_DELIVERY",
        monotonicNow: sequenceClock(100, 247),
      }),
    ).resolves.toMatchObject({ outcome: "sent" });

    expect(recorder.records).toEqual([
      {
        tenantKey: "geleoteka",
        operation: "NOTIFICATION_DELIVERY",
        outcome: "SUCCESS",
        durationMs: 147,
        isSlow: false,
        errorCode: null,
      },
    ]);
  });

  it("records the normalized error code for a rejected bot reply", async () => {
    const recorder = recordingDb();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          ok: false,
          error_code: 429,
          description: "Too Many Requests",
          parameters: { retry_after: 60 },
        },
        { status: 429 },
      ),
    );

    await expect(
      sendTelegramTextWithDiagnostics({
        client: recorder.db,
        fetchImpl,
        message: safeMessage(),
        operation: "WEBHOOK_REPLY",
        monotonicNow: sequenceClock(1_000, 1_321),
      }),
    ).resolves.toMatchObject({
      outcome: "failed",
      errorCode: "TELEGRAM_RATE_LIMITED",
    });

    expect(recorder.records[0]).toMatchObject({
      operation: "WEBHOOK_REPLY",
      outcome: "FAILURE",
      durationMs: 321,
      isSlow: false,
      errorCode: "TELEGRAM_RATE_LIMITED",
    });
  });

  it("marks a successful send beyond five seconds as slow", async () => {
    const recorder = recordingDb();

    await sendTelegramTextWithDiagnostics({
      client: recorder.db,
      fetchImpl: successfulFetch(),
      message: safeMessage(),
      operation: "NOTIFICATION_DELIVERY",
      monotonicNow: sequenceClock(5, 5 + TELEGRAM_SLOW_SEND_THRESHOLD_MS + 1),
    });

    expect(recorder.records[0]).toMatchObject({
      outcome: "SUCCESS",
      durationMs: TELEGRAM_SLOW_SEND_THRESHOLD_MS + 1,
      isSlow: true,
    });
  });

  it("never persists chat_id, bot token, text or Bot API URL", async () => {
    const recorder = recordingDb();
    const botToken = `987654:${"TOKEN_SENTINEL".repeat(3)}`;
    const chatId = "CHAT_ID_SENTINEL_777001";
    const text = "MESSAGE_TEXT_SENTINEL";

    await sendTelegramTextWithDiagnostics({
      client: recorder.db,
      fetchImpl: successfulFetch(),
      message: { botToken, chatId, text },
      operation: "WEBHOOK_REPLY",
      monotonicNow: sequenceClock(0, 75),
    });

    const persisted = JSON.stringify(recorder.records);
    expect(persisted).not.toContain(botToken);
    expect(persisted).not.toContain(chatId);
    expect(persisted).not.toContain(text);
    expect(persisted).not.toContain("chat_id");
    expect(persisted).not.toContain("botToken");
    expect(persisted).not.toContain("api.telegram.org");
  });

  it("keeps the successful send result when the diagnostic write fails", async () => {
    const dbErrorSecret = "DATABASE_URL_TOKEN_SENTINEL";
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = successfulFetch();
    const client: TelegramSendDiagnosticsWriteDb = {
      telegramSendAttempt: {
        create: async () => {
          throw new Error(dbErrorSecret);
        },
      },
    };

    try {
      await expect(
        sendTelegramTextWithDiagnostics({
          client,
          fetchImpl,
          message: safeMessage(),
          operation: "NOTIFICATION_DELIVERY",
          monotonicNow: sequenceClock(0, 80),
        }),
      ).resolves.toMatchObject({ outcome: "sent" });

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(JSON.stringify(error.mock.calls)).not.toContain(dbErrorSecret);
    } finally {
      error.mockRestore();
    }
  });

  it("deletes attempts older than the shared notification retention", async () => {
    const deleteMany = vi.fn(async () => ({ count: 4 }));
    const client: TelegramSendDiagnosticsRetentionDb = {
      telegramSendAttempt: { deleteMany },
    };

    await expect(
      retainTelegramSendAttempts(client, {
        retentionDays: 30,
        now: new Date("2026-08-01T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      deletedAttempts: 4,
      cutoff: new Date("2026-07-02T12:00:00.000Z"),
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        tenantKey: "geleoteka",
        createdAt: { lt: new Date("2026-07-02T12:00:00.000Z") },
      },
    });
  });
});

function recordingDb(): {
  db: TelegramSendDiagnosticsWriteDb;
  records: Array<Record<string, unknown>>;
} {
  const records: Array<Record<string, unknown>> = [];
  return {
    records,
    db: {
      telegramSendAttempt: {
        create: async (args) => {
          records.push((args as { data: Record<string, unknown> }).data);
          return {};
        },
      },
    },
  };
}

function successfulFetch() {
  return vi.fn<typeof fetch>(async () =>
    Response.json({ ok: true, result: { message_id: 42 } }),
  );
}

function safeMessage() {
  return {
    botToken: `123456:${"A".repeat(32)}`,
    chatId: "777001",
    text: "Привязка выполнена.",
  };
}

function sequenceClock(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}
