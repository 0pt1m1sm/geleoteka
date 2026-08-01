import { beforeEach, describe, expect, it, vi } from "vitest";

const { processUpdate } = vi.hoisted(() => ({ processUpdate: vi.fn() }));

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

import { POST } from "@/app/api/integrations/telegram/webhook/route";

describe("Telegram webhook route", () => {
  beforeEach(() => processUpdate.mockReset());

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
});
