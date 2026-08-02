import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadSecret: vi.fn(),
  loadConfig: vi.fn(),
  getSetting: vi.fn(),
  drainNow: vi.fn(),
  db: {} as Record<string, unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/settings", () => ({ getSetting: mocks.getSetting }));
vi.mock("@/lib/staff-notifications/channels/telegram/config", () => ({
  loadStaffNotificationDispatchSecret: mocks.loadSecret,
  loadTelegramRuntimeConfig: mocks.loadConfig,
}));
vi.mock(
  "@/lib/staff-notifications/channels/telegram/updates-runtime",
  () => ({ drainTelegramUpdatesNow: mocks.drainNow }),
);

import { POST } from "@/app/api/internal/staff-notifications/diagnostics/route";

const SECRET = "D".repeat(32);
const BASE = "https://relay.example";
const TOKEN = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const ENABLED_CONFIG = {
  enabled: true,
  enabledAt: new Date("2026-08-01T00:00:00.000Z"),
  botToken: TOKEN,
  botUsername: "GeleotekaStaffBot",
  webhookSecret: null,
  routingMode: "PERSONAL_ONLY",
  applicationOrigin: "https://geleoteka.ru",
  apiBaseUrl: BASE,
  enabledEventTypes: new Set(),
};

function requestWith(body: unknown, bearer = SECRET): Request {
  return new Request(
    "https://geleoteka.ru/api/internal/staff-notifications/diagnostics",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

function installDb(): void {
  Object.assign(mocks.db, {
    telegramPollState: {
      findUnique: async () => ({
        nextOffset: 41n,
        lastDrainStartedAt: new Date("2026-08-02T17:00:00.000Z"),
        stuckUpdateId: null,
        stuckAttempts: 0,
        stuckLastAt: null,
        leaseUntil: null,
      }),
    },
    telegramSendAttempt: {
      findMany: async () => [
        {
          createdAt: new Date("2026-08-02T17:00:01.000Z"),
          outcome: "FAILURE",
          durationMs: 3000,
          isSlow: false,
          errorCode: "TELEGRAM_TIMEOUT",
        },
      ],
    },
    telegramLinkToken: { count: async () => 1 },
    telegramDestination: { count: async () => 2 },
  });
}

function installTelegramFetch(webhookUrl: string): string[] {
  const methods: string[] = [];
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
    const method = String(input).split("/").pop() ?? "";
    methods.push(method);
    if (method === "getMe") {
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
      });
    }
    if (method === "getWebhookInfo") {
      return new Response(
        JSON.stringify({
          ok: true,
          result: { url: webhookUrl, pending_update_count: 7 },
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected method ${method}`);
  }) as typeof fetch);
  return methods;
}

describe("telegram diagnostics route", () => {
  beforeEach(() => {
    mocks.loadSecret.mockReset().mockResolvedValue(SECRET);
    mocks.loadConfig.mockReset().mockResolvedValue(ENABLED_CONFIG);
    mocks.getSetting.mockReset().mockResolvedValue(null);
    mocks.drainNow.mockReset().mockResolvedValue({
      status: "drained",
      processed: 1,
      batches: 1,
    });
    for (const key of Object.keys(mocks.db)) delete mocks.db[key];
    installDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("отбивает неверный Bearer до любых проб", async () => {
    const fetchCalls = installTelegramFetch("");
    const response = await POST(requestWith({}, "wrong-secret"));
    expect(response.status).toBe(401);
    expect(fetchCalls).toHaveLength(0);
    expect(mocks.drainNow).not.toHaveBeenCalled();
  });

  it("отдаёт безопасный срез: пробы, состояние, попытки; webhook как булево", async () => {
    const fetchCalls = installTelegramFetch("https://old.example/hook");

    const response = await POST(requestWith({ drain: true }));
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(fetchCalls).toEqual(["getMe", "getWebhookInfo"]);
    expect(payload.telegram).toEqual({
      getMe: "ok",
      webhook: { registered: true, pendingUpdates: 7 },
    });
    expect(payload.drain).toMatchObject({ status: "drained", processed: 1 });
    expect(mocks.drainNow).toHaveBeenCalledWith({
      force: true,
      budgetMs: 25_000,
      maxBatches: 3,
    });
    expect(payload.pollState).toMatchObject({ nextOffset: 41 });
    expect(payload.recentPolls[0]).toMatchObject({
      errorCode: "TELEGRAM_TIMEOUT",
    });
    expect(payload.destinations).toEqual({ total: 2, active: 2 });
    // Ни одного URL и ни одного секрета в сериализованном ответе.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("old.example");
    expect(serialized).not.toContain(TOKEN);
  });

  it("при выключенном канале не зовёт ни пробы, ни drain, но отдаёт вердикты полей", async () => {
    mocks.loadConfig.mockResolvedValue({
      enabled: false,
      reason: "invalid-config",
      enabledEventTypes: new Set(),
    });
    mocks.getSetting.mockImplementation(async (key: string) =>
      key === "TELEGRAM_ENABLED" ? "true" : null,
    );
    const fetchCalls = installTelegramFetch("");

    const response = await POST(requestWith({ drain: true }));
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(fetchCalls).toHaveLength(0);
    expect(mocks.drainNow).not.toHaveBeenCalled();
    expect(payload.config).toEqual({ enabled: false, reason: "invalid-config" });
    expect(payload.fields).toMatchObject({
      enabledFlag: true,
      botToken: "missing-or-invalid",
    });
  });
});
