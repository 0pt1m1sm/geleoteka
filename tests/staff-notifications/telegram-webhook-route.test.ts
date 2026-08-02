import { beforeEach, describe, expect, it, vi } from "vitest";

const { processUpdate, sendText } = vi.hoisted(() => ({
  processUpdate: vi.fn(),
  sendText: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
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
vi.mock("@/lib/staff-notifications/channels/telegram/webhook", () => ({
  processTelegramWebhookUpdate: processUpdate,
}));
vi.mock("@/lib/staff-notifications/channels/telegram/adapter", () => ({
  sendTelegramText: sendText,
}));

import { POST } from "@/app/api/integrations/telegram/webhook/route";

describe("Telegram webhook route", () => {
  beforeEach(() => {
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

  it("sends the post-commit reply through the existing Telegram sender", async () => {
    processUpdate.mockImplementation(
      async (
        _client: unknown,
        _update: unknown,
        _now: Date,
        sendReply: (reply: { chatId: string; text: string }) => Promise<unknown>,
      ) => {
        await sendReply({ chatId: "777001", text: "Привязка выполнена." });
        return "linked";
      },
    );
    sendText.mockResolvedValue({ outcome: "response" });

    const response = await POST(validWebhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: "linked" });
    expect(sendText).toHaveBeenCalledWith(globalThis.fetch, {
      botToken: `123456:${"A".repeat(32)}`,
      chatId: "777001",
      text: "Привязка выполнена.",
    });
  });

  it("keeps a 200 webhook response when sending the reply throws", async () => {
    processUpdate.mockImplementation(
      async (
        _client: unknown,
        _update: unknown,
        _now: Date,
        sendReply: (reply: { chatId: string; text: string }) => Promise<unknown>,
      ) => {
        await sendReply({ chatId: "777001", text: "Привязка выполнена." });
        return "linked";
      },
    );
    sendText.mockRejectedValue(new Error("SEND_FAILURE_SENTINEL"));

    const response = await POST(validWebhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: "linked" });
  });
});

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
