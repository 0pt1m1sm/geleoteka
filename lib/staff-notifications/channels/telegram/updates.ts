import {
  TELEGRAM_POLL_BATCH_LIMIT,
  TELEGRAM_POLL_COOLDOWN_MS,
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
  | { status: "skipped-cooldown"; processed: 0 }
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

  // The cooldown is a single atomic stamp update, not a lock. Concurrent
  // drains are harmless for correctness (processing is idempotent and the
  // offset only moves forward), so all the stamp prevents is pointless
  // duplicate network traffic from interactive status polling.
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

  const startedAt = monotonicNow();
  let processed = 0;
  let batches = 0;
  let webhookDeleted = false;

  while (batches < maxBatches) {
    if (monotonicNow() - startedAt > budgetMs) {
      return { status: "budget-exhausted", processed, batches };
    }

    const state = (await db.telegramPollState.findUnique({
      where: { tenantKey: TENANT_KEY },
      select: { nextOffset: true },
    })) as PollStateRow | null;
    const offset = Number(state?.nextOffset ?? 0);

    const batch = await fetchTelegramUpdates(db, fetchImpl, {
      apiBaseUrl: options.apiBaseUrl,
      botToken: options.botToken,
      offset,
      requestTimeoutMs,
      monotonicNow,
    });
    batches += 1;

    if (batch.outcome === "conflict") {
      // getUpdates refuses to run while a webhook registration exists. This
      // is the one-time migration edge (and the self-heal if anything ever
      // re-registers a webhook): drop the registration, keep pending updates,
      // and retry within the same drain.
      if (webhookDeleted) {
        return { status: "failed", errorCode: "TELEGRAM_CONFLICT", processed };
      }
      webhookDeleted = true;
      await deleteTelegramWebhook(fetchImpl, options, requestTimeoutMs);
      continue;
    }
    if (batch.outcome === "failed") {
      return { status: "failed", errorCode: batch.errorCode, processed };
    }

    let highestUpdateId: number | null = null;
    for (const update of batch.updates) {
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
        return {
          status: "failed",
          errorCode: "UPDATE_PROCESSING_FAILED",
          processed,
        };
      }
      processed += 1;
      if (updateId !== null) highestUpdateId = updateId;
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
