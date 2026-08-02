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
  stuckUpdateId: number | null;
  stuckAttempts: number;
  stuckLastAt: Date | null;
  leaseUntil: Date | null;
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
          stuckUpdateId: null,
          stuckAttempts: 0,
          stuckLastAt: null,
          leaseUntil: null,
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
      const data = args.data as Record<string, unknown>;
      if (where.nextOffset) {
        if (!(this.row.nextOffset < where.nextOffset.lt)) return { count: 0 };
        this.row.nextOffset = (args.data as { nextOffset: number }).nextOffset;
        return { count: 1 };
      }
      if ("stuckUpdateId" in data) {
        this.row.stuckUpdateId = data.stuckUpdateId as number | null;
        this.row.stuckAttempts = data.stuckAttempts as number;
        this.row.stuckLastAt = (data.stuckLastAt as Date | null) ?? null;
        return { count: 1 };
      }
      if ("leaseUntil" in data) {
        const leaseWhere = args.where as {
          leaseUntil?: Date;
          OR?: Array<{ leaseUntil?: null | { lt: Date } }>;
        };
        if (leaseWhere.leaseUntil instanceof Date) {
          // release: только собственный штамп
          if (
            this.row.leaseUntil !== null &&
            this.row.leaseUntil.getTime() === leaseWhere.leaseUntil.getTime()
          ) {
            this.row.leaseUntil = data.leaseUntil as Date | null;
            return { count: 1 };
          }
          return { count: 0 };
        }
        // acquire: свободен или протух
        const free = (leaseWhere.OR ?? []).some((clause) =>
          clause.leaseUntil === null
            ? this.row!.leaseUntil === null
            : this.row!.leaseUntil !== null &&
              this.row!.leaseUntil <
                (clause.leaseUntil as { lt: Date }).lt,
        );
        if (!free) return { count: 0 };
        this.row.leaseUntil = data.leaseUntil as Date;
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

  auditEntries: Array<Record<string, unknown>> = [];

  auditLog = {
    create: async (args: Record<string, unknown>) => {
      this.auditEntries.push(args.data as Record<string, unknown>);
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

function webhookInfoResponse(url: string): Response {
  return new Response(JSON.stringify({ ok: true, result: { url } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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

  it("self-heals the webhook conflict: 409 → getWebhookInfo → deleteWebhook → retry", async () => {
    const db = new FakePollDb();
    const { fetchImpl, calls } = fetchScript([
      new Response("conflict", { status: 409 }),
      webhookInfoResponse("https://old.example/hook"),
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }),
      updatesResponse([5]),
    ]);

    const result = await drainTelegramUpdates(db, fetchImpl, baseOptions());

    expect(result).toMatchObject({ status: "drained", processed: 1 });
    expect(calls.map((c) => c.url.split("/").pop())).toEqual([
      "getUpdates",
      "getWebhookInfo",
      "deleteWebhook",
      "getUpdates",
    ]);
    // Pending updates survive the mode switch: an employee may have sent the
    // link command seconds earlier.
    expect(calls[2].body).toMatchObject({ drop_pending_updates: false });
    expect(db.row?.nextOffset).toBe(6);
  });

  it("409 без зарегистрированного webhook (конкурентный getUpdates) → failed БЕЗ deleteWebhook", async () => {
    const db = new FakePollDb();
    const { fetchImpl, calls } = fetchScript([
      new Response("conflict", { status: 409 }),
      webhookInfoResponse(""),
    ]);

    const result = await drainTelegramUpdates(db, fetchImpl, baseOptions());

    expect(result).toEqual({
      status: "failed",
      errorCode: "TELEGRAM_CONFLICT",
      processed: 0,
    });
    expect(calls.map((c) => c.url.split("/").pop())).toEqual([
      "getUpdates",
      "getWebhookInfo",
    ]);
  });

  it("живой чужой lease: drain уходит skipped-lease без сетевых вызовов", async () => {
    const db = new FakePollDb();
    await db.telegramPollState.upsert({
      create: { tenantKey: "geleoteka", nextOffset: 0 },
      where: {},
    });
    db.row!.leaseUntil = new Date("2026-08-02T12:00:25.000Z"); // now + 25s

    const { fetchImpl, calls } = fetchScript([updatesResponse([])]);
    const result = await drainTelegramUpdates(db, fetchImpl, {
      ...baseOptions(),
      force: true,
    });

    expect(result).toEqual({ status: "skipped-lease", processed: 0 });
    expect(calls).toHaveLength(0);
    // Чужой штамп не тронут.
    expect(db.row?.leaseUntil?.toISOString()).toBe("2026-08-02T12:00:25.000Z");
  });

  it("протухший lease перехватывается, после drain lease освобождён", async () => {
    const db = new FakePollDb();
    await db.telegramPollState.upsert({
      create: { tenantKey: "geleoteka", nextOffset: 0 },
      where: {},
    });
    db.row!.leaseUntil = new Date("2026-08-02T11:59:00.000Z"); // протух

    const { fetchImpl } = fetchScript([updatesResponse([7])]);
    const result = await drainTelegramUpdates(db, fetchImpl, baseOptions());

    expect(result).toMatchObject({ status: "drained", processed: 1 });
    expect(db.row?.leaseUntil).toBeNull();
  });

  it("lease освобождается и после failed drain", async () => {
    const db = new FakePollDb();
    const { fetchImpl } = fetchScript([updatesResponse([30])]);
    const result = await drainTelegramUpdates(db, fetchImpl, {
      ...baseOptions(vi.fn(async () => {
        throw new Error("boom");
      })),
    });

    expect(result).toMatchObject({ status: "failed" });
    expect(db.row?.leaseUntil).toBeNull();
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

  it("карантинит стабильно падающий апдейт после 3 drain и обрабатывает хвост за ним", async () => {
    const db = new FakePollDb();
    const poison = vi.fn(async (update: unknown) => {
      if ((update as { update_id: number }).update_id === 30) {
        throw new Error("P2002 unique constraint");
      }
      return "ok";
    });
    // Попытки разнесены по времени (cron-каденция): подряд идущие быстрые
    // drain не считаются, см. отдельный тест на spacing.
    const drainAt = (iso: string) =>
      drainTelegramUpdates(
        db,
        fetchScript([updatesResponse([30, 31, 32])]).fetchImpl,
        { ...baseOptions(poison), force: true, now: () => new Date(iso) },
      );

    // Две первые попытки: drain падает, офсет стоит, счётчик копится durable.
    const times = ["2026-08-02T12:00:00.000Z", "2026-08-02T12:05:00.000Z"];
    for (const [index, iso] of times.entries()) {
      const failed = await drainAt(iso);
      expect(failed).toEqual({
        status: "failed",
        errorCode: "UPDATE_PROCESSING_FAILED",
        processed: 0,
      });
      expect(db.row?.nextOffset).toBe(0);
      expect(db.row?.stuckUpdateId).toBe(30);
      expect(db.row?.stuckAttempts).toBe(index + 1);
    }

    // Третья попытка: виновник в карантине, хвост за ним обработан.
    const third = await drainAt("2026-08-02T12:10:00.000Z");
    expect(third).toEqual({ status: "drained", processed: 2, batches: 1 });
    expect(db.row?.nextOffset).toBe(33);
    expect(db.row?.stuckUpdateId).toBeNull();
    expect(db.row?.stuckAttempts).toBe(0);
    expect(
      db.diagnostics.some((d) => d.errorCode === "UPDATE_QUARANTINED"),
    ).toBe(true);
    // След для расследования: update_id (число, без содержимого) в AuditLog.
    expect(
      db.auditEntries.some(
        (e) =>
          e.action === "telegram.update_quarantined" && e.targetId === "30",
      ),
    ).toBe(true);
    // Хвост (31, 32) обработан, виновник больше не предлагался процессору
    // лишний раз: по одному вызову на drain плюс хвост третьего.
    expect(
      poison.mock.calls.filter(
        ([u]) => (u as { update_id: number }).update_id === 30,
      ),
    ).toHaveLength(3);
  });

  it("быстрые повторные drain не сжигают попытки карантина (spacing)", async () => {
    const db = new FakePollDb();
    const poison = vi.fn(async () => {
      throw new Error("db down");
    });
    const drainAt = (iso: string) =>
      drainTelegramUpdates(
        db,
        fetchScript([updatesResponse([30])]).fetchImpl,
        { ...baseOptions(poison), force: true, now: () => new Date(iso) },
      );

    // Панель дёргает каждые ~5 секунд: короткий сбой БД не должен
    // превратиться в необратимый карантин апдейта за 15 секунд.
    await drainAt("2026-08-02T12:00:00.000Z");
    await drainAt("2026-08-02T12:00:05.000Z");
    await drainAt("2026-08-02T12:00:10.000Z");
    expect(db.row?.stuckAttempts).toBe(1);
    expect(db.row?.nextOffset).toBe(0);
    expect(
      db.diagnostics.some((d) => d.errorCode === "UPDATE_QUARANTINED"),
    ).toBe(false);
  });

  it("исключение при release lease не маскирует результат drain", async () => {
    const db = new FakePollDb();
    const realUpdateMany = db.telegramPollState.updateMany;
    db.telegramPollState.updateMany = async (args: Record<string, unknown>) => {
      const data = args.data as Record<string, unknown>;
      if ("leaseUntil" in data && data.leaseUntil === null) {
        throw new Error("connection lost");
      }
      return realUpdateMany(args);
    };

    const { fetchImpl } = fetchScript([updatesResponse([7])]);
    const result = await drainTelegramUpdates(db, fetchImpl, baseOptions());

    // Drain выполнен, offset подтверждён — сбой release не должен ни
    // выбрасываться (maintenance прервал бы overdue/retention), ни менять итог.
    expect(result).toMatchObject({ status: "drained", processed: 1 });
    expect(db.row?.nextOffset).toBe(8);
  });

  it("перехват lease посреди drain останавливает его без порчи чужого состояния", async () => {
    const db = new FakePollDb();
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);
    const { fetchImpl } = fetchScript([
      updatesResponse(ids),
      updatesResponse([200]),
    ]);
    const processUpdate = vi.fn(async (update: unknown) => {
      if ((update as { update_id: number }).update_id === 100) {
        // Симуляция: обработка затянулась, lease протух и перехвачен другим.
        db.row!.leaseUntil = new Date("2026-08-02T12:09:00.000Z");
      }
      return "ok";
    });

    const result = await drainTelegramUpdates(db, fetchImpl, {
      ...baseOptions(processUpdate),
      maxBatches: 3,
    });

    // Батч 1 подтверждён, но продолжать без владения нельзя — второй батч
    // не запрашивается, результат сигнализирует о конфликте.
    expect(result).toEqual({
      status: "failed",
      errorCode: "TELEGRAM_CONFLICT",
      processed: 100,
    });
    expect(db.row?.nextOffset).toBe(101);
    // Чужой lease не тронут ни продлением, ни release.
    expect(db.row?.leaseUntil?.toISOString()).toBe("2026-08-02T12:09:00.000Z");
  });

  it("transient-сбой не карантинится: после успеха счётчик сбрасывается, апдейт не теряется", async () => {
    const db = new FakePollDb();
    let failOnce = true;
    const flaky = vi.fn(async (update: unknown) => {
      if ((update as { update_id: number }).update_id === 30 && failOnce) {
        failOnce = false;
        throw new Error("deadlock, try again");
      }
      return "ok";
    });
    const drainOnce = () =>
      drainTelegramUpdates(
        db,
        fetchScript([updatesResponse([30, 31, 32])]).fetchImpl,
        { ...baseOptions(flaky), force: true },
      );

    const failed = await drainOnce();
    expect(failed).toMatchObject({ status: "failed" });
    expect(db.row?.stuckUpdateId).toBe(30);
    expect(db.row?.stuckAttempts).toBe(1);

    const recovered = await drainOnce();
    expect(recovered).toEqual({ status: "drained", processed: 3, batches: 1 });
    expect(db.row?.nextOffset).toBe(33);
    expect(db.row?.stuckUpdateId).toBeNull();
    expect(db.row?.stuckAttempts).toBe(0);
    expect(
      db.diagnostics.some((d) => d.errorCode === "UPDATE_QUARANTINED"),
    ).toBe(false);
  });

  it("wall-clock: исчерпанный бюджет останавливает разрешение 409 до getWebhookInfo", async () => {
    const db = new FakePollDb();
    let t = 0;
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input).split("/").pop() ?? "");
      t += 8_000; // медленная сеть съедает бюджет первым же вызовом
      return new Response("conflict", { status: 409 });
    }) as typeof fetch;

    const result = await drainTelegramUpdates(db, fetchImpl, {
      ...baseOptions(),
      budgetMs: 3_000,
      monotonicNow: () => t,
    });

    expect(result).toMatchObject({ status: "budget-exhausted" });
    expect(calls).toEqual(["getUpdates"]);
  });

  it("wall-clock: дедлайн внутри батча подтверждает префикс и выходит budget-exhausted", async () => {
    const db = new FakePollDb();
    let t = 0;
    const fetchImpl = (async () => {
      t += 1_000;
      return updatesResponse([1, 2, 3]);
    }) as typeof fetch;
    const slowProcess = vi.fn(async () => {
      t += 5_000;
      return "ok";
    });

    const result = await drainTelegramUpdates(db, fetchImpl, {
      ...baseOptions(slowProcess),
      budgetMs: 3_000,
      monotonicNow: () => t,
    });

    expect(result).toMatchObject({ status: "budget-exhausted", processed: 1 });
    expect(slowProcess).toHaveBeenCalledTimes(1);
    // Обработанный префикс подтверждён, необработанные придут в следующем drain.
    expect(db.row?.nextOffset).toBe(2);
  });

  it("wall-clock: сетевой таймаут урезается остатком бюджета", async () => {
    vi.useFakeTimers();
    try {
      const db = new FakePollDb();
      const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        })) as typeof fetch;

      const pending = drainTelegramUpdates(db, fetchImpl, {
        ...baseOptions(),
        budgetMs: 500,
        requestTimeoutMs: 8_000,
        monotonicNow: () => Date.now(),
      });
      // Через 600 мс (fake) запрос обязан быть уже оборван остатком бюджета
      // 500 мс, а не жить до полных 8 секунд.
      await vi.advanceTimersByTimeAsync(600);
      const result = await pending;
      expect(result).toEqual({
        status: "failed",
        errorCode: "TELEGRAM_TIMEOUT",
        processed: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("батч ровно в лимит (100) не считается осушением — drain продолжает", async () => {
    const db = new FakePollDb();
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);
    const { fetchImpl, calls } = fetchScript([
      updatesResponse(ids),
      updatesResponse([]),
    ]);

    const result = await drainTelegramUpdates(db, fetchImpl, baseOptions());

    expect(result).toEqual({ status: "drained", processed: 100, batches: 2 });
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toMatchObject({ offset: 101 });
    expect(db.row?.nextOffset).toBe(101);
  });

  it("длинный опрос: timeout уходит в тело запроса и урезается остатком бюджета", async () => {
    const db = new FakePollDb();
    const { fetchImpl, calls } = fetchScript([updatesResponse([9])]);
    await drainTelegramUpdates(db, fetchImpl, {
      ...baseOptions(),
      budgetMs: 45_000,
      longPollSeconds: 25,
    });
    expect(calls[0].body).toMatchObject({ timeout: 25 });

    // Бюджет мал (4с по умолчанию): на длинное ожидание места нет — опрос
    // деградирует до короткого, а не рвётся собственным таймаутом.
    const tight = fetchScript([updatesResponse([])]);
    await drainTelegramUpdates(new FakePollDb(), tight.fetchImpl, {
      ...baseOptions(),
      longPollSeconds: 25,
    });
    expect(tight.calls[0].body).toMatchObject({ timeout: 0 });
  });

  it("тихая диагностика: пустой успех не пишется, успех с апдейтами и провалы — пишутся", async () => {
    const db = new FakePollDb();
    await drainTelegramUpdates(db, fetchScript([updatesResponse([])]).fetchImpl, {
      ...baseOptions(),
      quietDiagnostics: true,
    });
    expect(db.diagnostics).toHaveLength(0);

    await drainTelegramUpdates(db, fetchScript([updatesResponse([70])]).fetchImpl, {
      ...baseOptions(),
      force: true,
      quietDiagnostics: true,
    });
    expect(db.diagnostics).toHaveLength(1);
    expect(db.diagnostics[0]).toMatchObject({ outcome: "SUCCESS" });

    await drainTelegramUpdates(
      db,
      fetchScript([new Error("socket hang up")]).fetchImpl,
      { ...baseOptions(), force: true, quietDiagnostics: true },
    );
    expect(db.diagnostics).toHaveLength(2);
    expect(db.diagnostics[1]).toMatchObject({ errorCode: "TELEGRAM_NETWORK" });
  });

  it("подавление повторного провала: suppressFailureDiagnostic глушит запись", async () => {
    const db = new FakePollDb();
    await drainTelegramUpdates(
      db,
      fetchScript([new Error("socket hang up")]).fetchImpl,
      { ...baseOptions(), suppressFailureDiagnostic: true },
    );
    expect(db.diagnostics).toHaveLength(0);
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
