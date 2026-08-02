import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  db: {} as Record<string, unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/staff-notifications/channels/telegram/config", () => ({
  loadTelegramRuntimeConfig: mocks.loadConfig,
}));

import { drainTelegramUpdatesNow } from "@/lib/staff-notifications/channels/telegram/updates-runtime";

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

interface RecordedCall {
  url: string;
  body: Record<string, unknown> | null;
}

function installFakeDb(): { diagnostics: Array<Record<string, unknown>> } {
  const diagnostics: Array<Record<string, unknown>> = [];
  const row = {
    tenantKey: "geleoteka",
    nextOffset: 0,
    lastDrainStartedAt: null as Date | null,
    stuckUpdateId: null as number | null,
    stuckAttempts: 0,
    leaseUntil: null as Date | null,
  };
  Object.assign(mocks.db, {
    telegramPollState: {
      upsert: async () => row,
      findUnique: async () => row,
      updateMany: async (args: Record<string, unknown>) => {
        const data = args.data as Record<string, unknown>;
        if ("nextOffset" in data) {
          row.nextOffset = data.nextOffset as number;
        } else if ("stuckUpdateId" in data) {
          row.stuckUpdateId = data.stuckUpdateId as number | null;
          row.stuckAttempts = data.stuckAttempts as number;
        } else if ("leaseUntil" in data) {
          row.leaseUntil = data.leaseUntil as Date | null;
        } else {
          row.lastDrainStartedAt = data.lastDrainStartedAt as Date;
        }
        return { count: 1 };
      },
    },
    telegramSendAttempt: {
      create: async (args: Record<string, unknown>) => {
        diagnostics.push(args.data as Record<string, unknown>);
        return {};
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        telegramUpdateReceipt: {
          createMany: async () => ({ count: 1 }),
        },
      }),
    auditLog: { create: async () => ({}) },
  });
  return { diagnostics };
}

function installFetch(script: Array<Response>): RecordedCall[] {
  const calls: RecordedCall[] = [];
  const queue = [...script];
  vi.stubGlobal("fetch", (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const next = queue.shift();
    if (!next) throw new Error("fetch script exhausted");
    return next;
  }) as typeof fetch);
  return calls;
}

describe("drainTelegramUpdatesNow (боевая обвязка)", () => {
  beforeEach(() => {
    mocks.loadConfig.mockReset();
    for (const key of Object.keys(mocks.db)) delete mocks.db[key];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("выключенный канал: channel-disabled без единого сетевого вызова", async () => {
    mocks.loadConfig.mockResolvedValue({
      enabled: false,
      reason: "disabled",
      enabledEventTypes: new Set(),
    });
    const calls = installFetch([]);

    const result = await drainTelegramUpdatesNow({ force: true });

    expect(result).toEqual({ status: "channel-disabled", processed: 0 });
    expect(calls).toHaveLength(0);
  });

  it("сквозная проводка: getUpdates → processor → вежливый ответ отправлен ДО завершения drain", async () => {
    mocks.loadConfig.mockResolvedValue(ENABLED_CONFIG);
    const { diagnostics } = installFakeDb();
    const calls = installFetch([
      new Response(
        JSON.stringify({
          ok: true,
          result: [
            {
              update_id: 42,
              message: {
                text: "/start",
                chat: { id: 555, type: "private" },
                from: { id: 555, is_bot: false },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
      new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ]);

    const result = await drainTelegramUpdatesNow({ force: true });

    expect(result).toMatchObject({ status: "drained", processed: 1 });
    // Ответ ушёл через тот же настраиваемый базовый адрес и ДО резолва drain.
    expect(calls.map((c) => c.url.split("/").pop())).toEqual([
      "getUpdates",
      "sendMessage",
    ]);
    expect(calls.every((c) => c.url.startsWith(`${BASE}/bot${TOKEN}/`))).toBe(
      true,
    );
    expect(calls[1].body).toMatchObject({ chat_id: "555" });
    // Диагностика обеих операций записана.
    const operations = diagnostics.map((d) => d.operation);
    expect(operations).toContain("UPDATES_POLL");
    expect(operations).toContain("WEBHOOK_REPLY");
  });
});
