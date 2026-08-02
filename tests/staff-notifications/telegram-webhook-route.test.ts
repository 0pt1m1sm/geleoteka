import { beforeEach, describe, expect, it, vi } from "vitest";

const { afterCallbacks, auditCreate, processUpdate, sendText } = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => void | Promise<void>>,
  auditCreate: vi.fn(),
  processUpdate: vi.fn(),
  sendText: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  },
}));
vi.mock("@/lib/db", () => ({
  db: { auditLog: { create: auditCreate } },
}));
vi.mock("@/lib/staff-notifications/channels/telegram/config", () => ({
  loadTelegramRuntimeConfig: vi.fn(async () => ({
    enabled: true,
    botToken: `123456:${"A".repeat(32)}`,
    botUsername: "GeleotekaStaffBot",
    webhookSecret: "S".repeat(32),
    routingMode: "PERSONAL_ONLY",
    applicationOrigin: "https://geleoteka.ru",
    enabledEventTypes: new Set(["INBOUND_CUSTOMER_MESSAGE"]),
  })),
}));
vi.mock(
  "@/lib/staff-notifications/channels/telegram/webhook",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/staff-notifications/channels/telegram/webhook")
    >()),
    processTelegramWebhookUpdate: processUpdate,
  }),
);
vi.mock(
  "@/lib/staff-notifications/channels/telegram/adapter",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/staff-notifications/channels/telegram/adapter")
    >()),
    sendTelegramTextWithDiagnostics: sendText,
  }),
);

import { POST } from "@/app/api/integrations/telegram/webhook/route";

describe("Telegram webhook route", () => {
  beforeEach(() => {
    afterCallbacks.length = 0;
    auditCreate.mockReset().mockResolvedValue({});
    processUpdate.mockReset();
    sendText.mockReset();
  });

  it("rejects an incorrect webhook secret before processing the update", async () => {
    const response = await POST(
      new Request("https://geleoteka.ru/api/integrations/telegram/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "wrong-secret",
        },
        body: JSON.stringify({ update_id: 1 }),
      }),
    );

    expect(response.status).toBe(401);
    expect(processUpdate).not.toHaveBeenCalled();
  });

  it("returns the webhook response while the post-response send is still pending", async () => {
    const pendingSend = deferred<ReturnType<typeof successfulSendResult>>();
    let transactionCommitted = false;
    processUpdate.mockImplementation(
      async (
        _client: unknown,
        _update: unknown,
        _now: Date,
        scheduleReply: (reply: { chatId: string; text: string }) => void,
      ) => {
        transactionCommitted = true;
        scheduleReply({ chatId: "777001", text: "Привязка выполнена." });
        return "linked";
      },
    );
    sendText.mockReturnValue(pendingSend.promise);

    let earlyResponse: Awaited<ReturnType<typeof POST>> | null = null;
    const responsePromise = POST(validWebhookRequest()).then((response) => {
      earlyResponse = response;
      return response;
    });
    await nextEventLoopTurn();

    const returnedBeforeSendFinished = earlyResponse !== null;
    const sentBeforeAfter = sendText.mock.calls.length > 0;
    const callback = afterCallbacks.shift();
    let backgroundSettled = false;
    const backgroundPromise = callback
      ? Promise.resolve(callback()).finally(() => {
          backgroundSettled = true;
        })
      : null;
    await nextEventLoopTurn();
    const backgroundWasPending = callback !== undefined && !backgroundSettled;

    pendingSend.resolve(successfulSendResult());
    const response = await responsePromise;
    await backgroundPromise;

    expect(transactionCommitted).toBe(true);
    expect(returnedBeforeSendFinished).toBe(true);
    expect(sentBeforeAfter).toBe(false);
    expect(callback).toBeDefined();
    expect(backgroundWasPending).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: "linked" });
    expect(sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchImpl: globalThis.fetch,
        message: {
          botToken: `123456:${"A".repeat(32)}`,
          chatId: "777001",
          text: "Привязка выполнена.",
        },
        operation: "WEBHOOK_REPLY",
      }),
    );
  });

  it("keeps the committed webhook response when the background send throws", async () => {
    let transactionCommitted = false;
    processUpdate.mockImplementation(
      async (
        _client: unknown,
        _update: unknown,
        _now: Date,
        scheduleReply: (reply: { chatId: string; text: string }) => void,
      ) => {
        transactionCommitted = true;
        scheduleReply({ chatId: "777001", text: "Привязка выполнена." });
        return "linked";
      },
    );
    sendText.mockRejectedValue(new Error("network unavailable"));

    const response = await POST(validWebhookRequest());

    expect(transactionCommitted).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: "linked" });
    await runNextAfterCallback();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "telegram.webhook_reply_failed",
        metadata: {
          errorCode: "TELEGRAM_NETWORK",
          httpStatus: null,
        },
      }),
    });
  });

  it("records the classified error code from a background Telegram rejection", async () => {
    processUpdate.mockImplementation(
      async (
        _client: unknown,
        _update: unknown,
        _now: Date,
        scheduleReply: (reply: { chatId: string; text: string }) => void,
      ) => {
        scheduleReply({ chatId: "777001", text: "Привязка выполнена." });
        return "linked";
      },
    );
    sendText.mockResolvedValue({
      outcome: "failed",
      errorCode: "TELEGRAM_RATE_LIMITED",
      httpStatus: 429,
      retryAfterMs: 60_000,
    });

    const response = await POST(validWebhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: "linked" });
    await runNextAfterCallback();
    expect(sendText).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "telegram.webhook_reply_failed",
        metadata: {
          errorCode: "TELEGRAM_RATE_LIMITED",
          httpStatus: 429,
        },
      }),
    });
  });
});

function successfulSendResult() {
  return {
    outcome: "sent" as const,
    providerMessageId: "42",
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function nextEventLoopTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function runNextAfterCallback(): Promise<void> {
  const callback = afterCallbacks.shift();
  expect(callback).toBeDefined();
  await callback?.();
}

function validWebhookRequest(): Request {
  return new Request("https://geleoteka.ru/api/integrations/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "S".repeat(32),
    },
    body: JSON.stringify({ update_id: 2 }),
  });
}
