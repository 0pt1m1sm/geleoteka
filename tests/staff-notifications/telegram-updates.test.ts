import { describe, expect, it, vi } from "vitest";

import {
  drainTelegramUpdates,
  type TelegramPollStateDb,
} from "@/lib/staff-notifications/channels/telegram/updates";

const BASE = "https://relay.example";
const TOKEN = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

interface PollRow {
  tenantKey: string;
  nextOffset: number;
  lastDrainStartedAt: Date | null;
}

class FakePollDb implements TelegramPollStateDb {
  row: PollRow | null = null;
  diagnostics: Array<Record<string, unknown>> = [];

  telegramPollState = {
    upsert: async (args: Record<string, unknown>) => {
      if (!this.row) {
        const create = args.create as { tenantKey: string; nextOffset: number };
        this.row = {
          tenantKey: create.tenantKey,
          nextOffset: create.nextOffset,
          lastDrainStartedAt: null,
        };
      }
      return this.row;
    },
    findUnique: async () => this.row,
    updateMany: async (args: Record<string, unknown>) => {
      if (!this.row) return { count: 0 };
      const where = args.where as {
        nextOffset?: { lt: number };
        OR?: Array<{
          lastDrainStartedAt?: null | { lt: Date };
        }>;
      };
      if (where.nextOffset) {
        if (!(this.row.nextOffset < where.nextOffset.lt)) return { count: 0 };
        this.row.nextOffset = (args.data as { nextOffset: number }).nextOffset;
        return { count: 1 };
      }
      if (where.OR) {
        const passes = where.OR.some((clause) =>
          clause.lastDrainStartedAt === null
            ? this.row!.lastDrainStartedAt === null
            : this.row!.lastDrainStartedAt !== null &&
              this.row!.lastDrainStartedAt <
                (clause.lastDrainStartedAt as { lt: Date }).lt,
        );
        if (!passes) return { count: 0 };
      }
      this.row.lastDrainStartedAt = (
        args.data as { lastDrainStartedAt: Date }
      ).lastDrainStartedAt;
      return { count: 1 };
    },
  };

  telegramSendAttempt = {
    create: async (args: Record<string, unknown>) => {
      this.diagnostics.push(args.data as Record<string, unknown>);
      return {};
    },
  };
}

function updatesResponse(ids: number[]): Response {
  return new Response(
    JSON.stringify({ ok: true, result: ids.map((id) => ({ update_id: id })) }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function fetchScript(
  responses: Array<Response | Error>,
): { fetchImpl: typeof fetch; calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  const queue = [...responses];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const next = queue.shift();
    if (!next) throw new Error("fetch script exhausted");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function baseOptions(
  processUpdate: (update: unknown) => Promise<unknown> = vi.fn(
    async () => "linked",
  ),
) {
  return {
    apiBaseUrl: BASE,
    botToken: TOKEN,
    processUpdate,
    now: () => new Date("2026-08-02T12:00:00.000Z"),
  };
}

describe("drainTelegramUpdates", () => {
  it("processes a batch, confirms it through the offset and stops when drained", async () => {
    const db = new FakePollDb();
    const processUpdate = vi.fn(async () => "linked");
    const { fetchImpl, calls } = fetchScript([updatesResponse([10, 11, 12])]);

    const result = await drainTelegramUpdates(db, fetchImpl, {
      ...baseOptions(processUpdate),
    });

    expect(result).toEqual({ status: "drained", processed: 3, batches: 1 });
    expect(processUpdate).toHaveBeenCalledTimes(3);
    expect(db.row?.nextOffset).toBe(13);
    expect(calls[0].url).toBe(`${BASE}/bot${TOKEN}/getUpdates`);
    expect(calls[0].body).toMatchObject({ offset: 0, timeout: 0 });
    expect(db.diagnostics).toHaveLength(1);
    expect(db.diagnostics[0]).toMatchObject({
      operation: "UPDATES_POLL",
      outcome: "SUCCESS",
    });
  });

  it("self-heals the webhook conflict: 409 → deleteWebhook → retry in one drain", async () => {
    const db = new FakePollDb();
    const { fetchImpl, calls } = fetchScript([
      new Response("conflict", { status: 409 }),
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }),
      updatesResponse([5]),
    ]);

    const result = await drainTelegramUpdates(db, fetchImpl, baseOptions());

    expect(result).toMatchObject({ status: "drained", processed: 1 });
    expect(calls.map((c) => c.url.split("/").pop())).toEqual([
      "getUpdates",
      "deleteWebhook",
      "getUpdates",
    ]);
    // Pending updates survive the mode switch: an employee may have sent the
    // link command seconds earlier.
    expect(calls[1].body).toMatchObject({ drop_pending_updates: false });
    expect(db.row?.nextOffset).toBe(6);
  });

  it("skips when a drain ran within the cooldown, unless forced", async () => {
    const db = new FakePollDb();
    const first = fetchScript([updatesResponse([])]);
    await drainTelegramUpdates(db, first.fetchImpl, baseOptions());

    const second = fetchScript([updatesResponse([])]);
    const skipped = await drainTelegramUpdates(db, second.fetchImpl, baseOptions());
    expect(skipped).toEqual({ status: "skipped-cooldown", processed: 0 });
    expect(second.calls).toHaveLength(0);

    const third = fetchScript([updatesResponse([])]);
    const forced = await drainTelegramUpdates(db, third.fetchImpl, {
      ...baseOptions(),
      force: true,
    });
    expect(forced).toMatchObject({ status: "drained" });
    expect(third.calls).toHaveLength(1);
  });

  it("confirms the processed prefix and reports failure when a processor throws", async () => {
    const db = new FakePollDb();
    const processUpdate = vi
      .fn(async () => "ok")
      .mockResolvedValueOnce("ok")
      .mockRejectedValueOnce(new Error("db down"));
    const { fetchImpl } = fetchScript([updatesResponse([20, 21, 22])]);

    const result = await drainTelegramUpdates(db, fetchImpl, {
      ...baseOptions(processUpdate),
    });

    expect(result).toEqual({
      status: "failed",
      errorCode: "UPDATE_PROCESSING_FAILED",
      processed: 1,
    });
    // Update 20 is confirmed; 21 stays unconfirmed for the next drain.
    expect(db.row?.nextOffset).toBe(21);
  });

  it("records a failure diagnostic and returns the normalized code on network error", async () => {
    const db = new FakePollDb();
    const { fetchImpl } = fetchScript([new Error("socket hang up")]);

    const result = await drainTelegramUpdates(db, fetchImpl, baseOptions());

    expect(result).toEqual({
      status: "failed",
      errorCode: "TELEGRAM_NETWORK",
      processed: 0,
    });
    expect(db.diagnostics[0]).toMatchObject({
      operation: "UPDATES_POLL",
      outcome: "FAILURE",
      errorCode: "TELEGRAM_NETWORK",
    });
  });

  it("never lets a stale drain rewind the offset", async () => {
    const db = new FakePollDb();
    await db.telegramPollState.upsert({
      create: { tenantKey: "geleoteka", nextOffset: 0 },
      where: {},
    });
    db.row!.nextOffset = 50;

    const { fetchImpl } = fetchScript([updatesResponse([])]);
    await drainTelegramUpdates(db, fetchImpl, baseOptions());
    // Empty batch → no advance attempt; simulate a raced stale advance:
    await db.telegramPollState.updateMany({
      where: { nextOffset: { lt: 40 } },
      data: { nextOffset: 40 },
    });
    expect(db.row?.nextOffset).toBe(50);
  });
});
