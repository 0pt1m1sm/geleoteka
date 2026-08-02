import {
  TELEGRAM_POLL_BATCH_LIMIT,
  TELEGRAM_POLL_COOLDOWN_MS,
  TELEGRAM_POLL_LEASE_MS,
  TELEGRAM_POLL_POISON_MAX_ATTEMPTS,
  TELEGRAM_POLL_REQUEST_TIMEOUT_MS,
} from "@/lib/staff-notifications/channels/telegram/constants";
import { telegramApiMethodUrl } from "@/lib/staff-notifications/channels/telegram/adapter";
import {
  recordTelegramSendDiagnostic,
  type TelegramSendDiagnosticsWriteDb,
} from "@/lib/staff-notifications/channels/telegram/diagnostics";
import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

/**
 * Inbound updates via getUpdates polling.
 *
 * Webhooks require Telegram to reach a Russian-hosted server, and RKN
 * throttling makes that path time out; Telegram then backs off its retries
 * and updates arrive minutes late. Polling inverts the direction: we call
 * out, we control the retry cadence, and inbound reachability of this host
 * stops mattering entirely.
 *
 * This module is transport only. It knows how to fetch batches, confirm them
 * through the offset, and recover from the webhook/polling mode conflict.
 * What an update MEANS is the injected processor's business — the same
 * domain code the webhook route uses.
 */

export interface TelegramPollStateDb extends TelegramSendDiagnosticsWriteDb {
  telegramPollState: {
    upsert(args: QueryArgs): Promise<unknown>;
    findUnique(args: QueryArgs): Promise<unknown>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
}

export interface DrainTelegramUpdatesOptions {
  apiBaseUrl: string;
  botToken: string;
  /** Domain handler for one raw update. Must be idempotent (it is: receipts). */
  processUpdate: (update: unknown) => Promise<unknown>;
  /** Wall-clock budget for the whole drain, network time included. */
  budgetMs?: number;
  maxBatches?: number;
  /**
   * Cron passes true: its cadence is already externally limited, and it must
   * not be starved by interactive drains refreshing the cooldown stamp.
   */
  force?: boolean;
  now?: () => Date;
  monotonicNow?: () => number;
  requestTimeoutMs?: number;
}

export type DrainTelegramUpdatesResult =
  | { status: "skipped-cooldown" | "skipped-lease"; processed: 0 }
  | { status: "failed"; errorCode: TelegramPollErrorCode; processed: number }
  | { status: "drained" | "budget-exhausted"; processed: number; batches: number };

export type TelegramPollErrorCode =
  | "TELEGRAM_NETWORK"
  | "TELEGRAM_TIMEOUT"
  | "TELEGRAM_CONFLICT"
  | "TELEGRAM_AUTH_REJECTED"
  | "TELEGRAM_REJECTED"
  | "UPDATE_PROCESSING_FAILED";

interface PollStateRow {
  nextOffset: bigint | number;
  stuckUpdateId: bigint | number | null;
  stuckAttempts: number;
}

interface TelegramUpdatesResponse {
  ok?: boolean;
  result?: unknown[];
}

export async function drainTelegramUpdates(
  db: TelegramPollStateDb,
  fetchImpl: typeof fetch,
  options: DrainTelegramUpdatesOptions,
): Promise<DrainTelegramUpdatesResult> {
  const now = options.now ?? (() => new Date());
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const budgetMs = options.budgetMs ?? 4_000;
  const maxBatches = Math.max(1, options.maxBatches ?? 3);
  const requestTimeoutMs =
    options.requestTimeoutMs ?? TELEGRAM_POLL_REQUEST_TIMEOUT_MS;

  await db.telegramPollState.upsert({
    where: { tenantKey: TENANT_KEY },
    create: { tenantKey: TENANT_KEY, nextOffset: 0 },
    update: {},
  });

  // The cooldown is cadence control for interactive callers (the panel's
  // 5-second status polling); cron's force bypasses it. Mutual exclusion is
  // the lease below — the cooldown only prevents pointless traffic.
  const startedAtWall = now();
  const stamped = await db.telegramPollState.updateMany({
    where: {
      tenantKey: TENANT_KEY,
      ...(options.force
        ? {}
        : {
            OR: [
              { lastDrainStartedAt: null },
              {
                lastDrainStartedAt: {
                  lt: new Date(startedAtWall.getTime() - TELEGRAM_POLL_COOLDOWN_MS),
                },
              },
            ],
          }),
    },
    data: { lastDrainStartedAt: startedAtWall },
  });
  if (stamped.count === 0) return { status: "skipped-cooldown", processed: 0 };

  // Single-flight lease: ровно один drain на токен. Второй одновременный
  // getUpdates «терминирует» первый на стороне Telegram (409), поэтому
  // перекрытие пресекается ещё до сети. force кулдаун обходит, lease — нет.
  const leaseUntil = new Date(startedAtWall.getTime() + TELEGRAM_POLL_LEASE_MS);
  const leased = await db.telegramPollState.updateMany({
    where: {
      tenantKey: TENANT_KEY,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: startedAtWall } }],
    },
    data: { leaseUntil },
  });
  if (leased.count === 0) return { status: "skipped-lease", processed: 0 };

  try {
    return await runDrainLoop(db, fetchImpl, options, {
      budgetMs,
      maxBatches,
      requestTimeoutMs,
      monotonicNow,
    });
  } finally {
    // Освобождаем только собственный штамп: протухший и перехваченный lease
    // нельзя снимать из-под нового владельца.
    await db.telegramPollState.updateMany({
      where: { tenantKey: TENANT_KEY, leaseUntil },
      data: { leaseUntil: null },
    });
  }
}

async function runDrainLoop(
  db: TelegramPollStateDb,
  fetchImpl: typeof fetch,
  options: DrainTelegramUpdatesOptions,
  limits: {
    budgetMs: number;
    maxBatches: number;
    requestTimeoutMs: number;
    monotonicNow: () => number;
  },
): Promise<DrainTelegramUpdatesResult> {
  const { budgetMs, maxBatches, requestTimeoutMs, monotonicNow } = limits;
  const startedAt = monotonicNow();
  // Жёсткий wall-clock: дедлайн проверяется перед каждым сетевым вызовом и
  // каждой обработкой, а таймаут каждого вызова урезается остатком бюджета —
  // иначе drain с бюджетом 3с доживал до ~16с (fetch 8с + deleteWebhook 8с).
  const deadlineAt = startedAt + budgetMs;
  const remaining = (): number => deadlineAt - monotonicNow();
  let processed = 0;
  let batches = 0;
  let webhookDeleted = false;

  while (batches < maxBatches) {
    if (remaining() <= 0) {
      return { status: "budget-exhausted", processed, batches };
    }

    const state = (await db.telegramPollState.findUnique({
      where: { tenantKey: TENANT_KEY },
      select: { nextOffset: true, stuckUpdateId: true, stuckAttempts: true },
    })) as PollStateRow | null;
    const offset = Number(state?.nextOffset ?? 0);
    let stuck = {
      updateId:
        state?.stuckUpdateId === null || state?.stuckUpdateId === undefined
          ? null
          : Number(state.stuckUpdateId),
      attempts: state?.stuckAttempts ?? 0,
    };

    const batch = await fetchTelegramUpdates(db, fetchImpl, {
      apiBaseUrl: options.apiBaseUrl,
      botToken: options.botToken,
      offset,
      requestTimeoutMs: capTimeout(requestTimeoutMs, remaining()),
      monotonicNow,
    });
    batches += 1;

    if (batch.outcome === "conflict") {
      // 409 двусмысленен: активная webhook-регистрация ИЛИ параллельный
      // getUpdates с тем же токеном. Различает только getWebhookInfo —
      // слепое удаление маскировало бы перекрытие под смену режима.
      if (webhookDeleted) {
        return { status: "failed", errorCode: "TELEGRAM_CONFLICT", processed };
      }
      if (remaining() <= 0) {
        return { status: "budget-exhausted", processed, batches };
      }
      const registered = await telegramWebhookRegistered(
        fetchImpl,
        options,
        capTimeout(requestTimeoutMs, remaining()),
      );
      if (registered !== true) {
        return { status: "failed", errorCode: "TELEGRAM_CONFLICT", processed };
      }
      if (remaining() <= 0) {
        return { status: "budget-exhausted", processed, batches };
      }
      // Одноразовая грань миграции (и самолечение, если что-то снова
      // зарегистрирует webhook): снять регистрацию, сохранить накопленные
      // апдейты, повторить в этом же drain.
      webhookDeleted = true;
      await deleteTelegramWebhook(
        fetchImpl,
        options,
        capTimeout(requestTimeoutMs, remaining()),
      );
      continue;
    }
    if (batch.outcome === "failed") {
      return { status: "failed", errorCode: batch.errorCode, processed };
    }

    let highestUpdateId: number | null = null;
    for (const update of batch.updates) {
      if (remaining() <= 0) {
        if (highestUpdateId !== null) {
          await advanceOffset(db, highestUpdateId + 1);
        }
        return { status: "budget-exhausted", processed, batches };
      }
      const updateId = readUpdateId(update);
      try {
        await options.processUpdate(update);
      } catch {
        // Confirm what we DID process, then surface the failure: advancing
        // past a failed update would silently drop it, and not advancing at
        // all would re-run the already-processed prefix forever.
        if (highestUpdateId !== null) {
          await advanceOffset(db, highestUpdateId + 1);
        }
        const attempts =
          updateId !== null && stuck.updateId === updateId
            ? stuck.attempts + 1
            : 1;
        if (updateId !== null && attempts >= TELEGRAM_POLL_POISON_MAX_ATTEMPTS) {
          // Quarantine: the same update failed this many drains in a row, so
          // the failure is deterministic and waiting will not fix it. Skipping
          // one poisoned update is the lesser evil next to silently blocking
          // every update behind it. Only the counter is durable — no update
          // content is ever stored.
          await advanceOffset(db, updateId + 1);
          await writeStuckState(db, null, 0);
          stuck = { updateId: null, attempts: 0 };
          await recordTelegramSendDiagnostic(db, {
            operation: "UPDATES_POLL",
            outcome: "FAILURE",
            durationMs: 0,
            errorCode: "UPDATE_QUARANTINED",
          });
          highestUpdateId = updateId;
          continue;
        }
        if (updateId !== null) {
          await writeStuckState(db, updateId, attempts);
        }
        return {
          status: "failed",
          errorCode: "UPDATE_PROCESSING_FAILED",
          processed,
        };
      }
      processed += 1;
      if (updateId !== null) {
        highestUpdateId = updateId;
        if (stuck.updateId === updateId) {
          await writeStuckState(db, null, 0);
          stuck = { updateId: null, attempts: 0 };
        }
      }
    }

    if (highestUpdateId !== null) {
      await advanceOffset(db, highestUpdateId + 1);
    }
    if (batch.updates.length < TELEGRAM_POLL_BATCH_LIMIT) {
      return { status: "drained", processed, batches };
    }
  }

  return { status: "budget-exhausted", processed, batches };
}

type FetchBatchResult =
  | { outcome: "ok"; updates: unknown[] }
  | { outcome: "conflict" }
  | { outcome: "failed"; errorCode: Exclude<TelegramPollErrorCode, "TELEGRAM_CONFLICT" | "UPDATE_PROCESSING_FAILED"> };

async function fetchTelegramUpdates(
  db: TelegramSendDiagnosticsWriteDb,
  fetchImpl: typeof fetch,
  input: {
    apiBaseUrl: string;
    botToken: string;
    offset: number;
    requestTimeoutMs: number;
    monotonicNow: () => number;
  },
): Promise<FetchBatchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.requestTimeoutMs);
  const startedAt = input.monotonicNow();

  let result: FetchBatchResult;
  try {
    const response = await fetchImpl(
      telegramApiMethodUrl(input.apiBaseUrl, input.botToken, "getUpdates"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offset: input.offset,
          limit: TELEGRAM_POLL_BATCH_LIMIT,
          timeout: 0,
          allowed_updates: ["message"],
        }),
        signal: controller.signal,
      },
    );
    if (response.status === 409) {
      result = { outcome: "conflict" };
    } else if (response.status === 401) {
      result = { outcome: "failed", errorCode: "TELEGRAM_AUTH_REJECTED" };
    } else {
      const body = (await response.json().catch(() => null)) as
        | TelegramUpdatesResponse
        | null;
      result =
        response.ok && body?.ok === true && Array.isArray(body.result)
          ? { outcome: "ok", updates: body.result }
          : { outcome: "failed", errorCode: "TELEGRAM_REJECTED" };
    }
  } catch {
    result = controller.signal.aborted
      ? { outcome: "failed", errorCode: "TELEGRAM_TIMEOUT" }
      : { outcome: "failed", errorCode: "TELEGRAM_NETWORK" };
  } finally {
    clearTimeout(timer);
  }

  await recordTelegramSendDiagnostic(db, {
    operation: "UPDATES_POLL",
    outcome: result.outcome === "ok" ? "SUCCESS" : "FAILURE",
    durationMs: input.monotonicNow() - startedAt,
    errorCode:
      result.outcome === "ok"
        ? null
        : result.outcome === "conflict"
          ? "TELEGRAM_CONFLICT"
          : result.errorCode,
  });
  return result;
}

/**
 * true — webhook зарегистрирован; false — точно нет (значит, 409 вызван
 * конкурентным getUpdates); null — выяснить не удалось. Значение url
 * проверяется ТОЛЬКО на непустоту и никуда не логируется.
 */
async function telegramWebhookRegistered(
  fetchImpl: typeof fetch,
  options: Pick<DrainTelegramUpdatesOptions, "apiBaseUrl" | "botToken">,
  requestTimeoutMs: number,
): Promise<boolean | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(
      telegramApiMethodUrl(options.apiBaseUrl, options.botToken, "getWebhookInfo"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: { url?: unknown };
    } | null;
    if (body?.ok !== true) return null;
    return typeof body.result?.url === "string" && body.result.url.length > 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function deleteTelegramWebhook(
  fetchImpl: typeof fetch,
  options: Pick<DrainTelegramUpdatesOptions, "apiBaseUrl" | "botToken">,
  requestTimeoutMs: number,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    // drop_pending_updates stays false on purpose: an employee may have sent
    // a link command seconds before the mode switch, and dropping the queue
    // would silently eat it. Old duplicates are harmless — update receipts
    // make processing idempotent.
    await fetchImpl(
      telegramApiMethodUrl(options.apiBaseUrl, options.botToken, "deleteWebhook"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ drop_pending_updates: false }),
        signal: controller.signal,
      },
    );
  } catch {
    // The retried getUpdates call reports the real outcome either way.
  } finally {
    clearTimeout(timer);
  }
}

function capTimeout(baseTimeoutMs: number, remainingMs: number): number {
  return Math.max(1, Math.min(baseTimeoutMs, Math.ceil(remainingMs)));
}

async function writeStuckState(
  db: TelegramPollStateDb,
  stuckUpdateId: number | null,
  stuckAttempts: number,
): Promise<void> {
  await db.telegramPollState.updateMany({
    where: { tenantKey: TENANT_KEY },
    data: { stuckUpdateId, stuckAttempts },
  });
}

async function advanceOffset(
  db: TelegramPollStateDb,
  nextOffset: number,
): Promise<void> {
  // Monotonic guard instead of a lock: a stale concurrent drain can only
  // fail this condition, never rewind confirmed updates.
  await db.telegramPollState.updateMany({
    where: { tenantKey: TENANT_KEY, nextOffset: { lt: nextOffset } },
    data: { nextOffset },
  });
}

function readUpdateId(update: unknown): number | null {
  if (update === null || typeof update !== "object") return null;
  const value = (update as Record<string, unknown>).update_id;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}
