import "server-only";

import { db } from "@/lib/db";
import { sendTelegramTextWithDiagnostics } from "@/lib/staff-notifications/channels/telegram/adapter";
import { loadTelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config";
import type { TelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config-values";
import type { TelegramSendDiagnosticsWriteDb } from "@/lib/staff-notifications/channels/telegram/diagnostics";
import {
  drainTelegramUpdates,
  type DrainTelegramUpdatesResult,
  type TelegramPollStateDb,
} from "@/lib/staff-notifications/channels/telegram/updates";
import {
  deliverTelegramWebhookReply,
  processTelegramWebhookUpdate,
  type TelegramWebhookDb,
} from "@/lib/staff-notifications/channels/telegram/webhook";

/**
 * The one production wiring of the polling drain: real db, real fetch, and
 * the same domain processor the webhook route uses — so an update means the
 * same thing regardless of which transport carried it. Courtesy replies are
 * awaited here (there is no client waiting on a cron tick or status check),
 * remain best-effort, and record their failures like every other send.
 */
export async function drainTelegramUpdatesNow(options: {
  force?: boolean;
  budgetMs?: number;
  maxBatches?: number;
  longPollSeconds?: number;
  quietDiagnostics?: boolean;
  suppressFailureDiagnostic?: boolean;
}): Promise<
  DrainTelegramUpdatesResult | { status: "channel-disabled"; processed: 0 }
> {
  const config = await loadTelegramRuntimeConfig();
  if (!config.enabled) return { status: "channel-disabled", processed: 0 };

  return drainTelegramUpdates(
    db as unknown as TelegramPollStateDb,
    globalThis.fetch,
    {
      apiBaseUrl: config.apiBaseUrl,
      botToken: config.botToken,
      processUpdate: createTelegramUpdateProcessor(config),
      force: options.force,
      budgetMs: options.budgetMs,
      maxBatches: options.maxBatches,
      longPollSeconds: options.longPollSeconds,
      quietDiagnostics: options.quietDiagnostics,
      suppressFailureDiagnostic: options.suppressFailureDiagnostic,
    },
  );
}

function createTelegramUpdateProcessor(
  config: Extract<TelegramRuntimeConfig, { enabled: true }>,
): (update: unknown) => Promise<unknown> {
  return (update) =>
    processTelegramWebhookUpdate(
      db as unknown as TelegramWebhookDb,
      update,
      new Date(),
      async (reply) => {
        await deliverTelegramWebhookReply(
          db as unknown as TelegramWebhookDb,
          reply,
          async ({ chatId, text }) => {
            const normalized = await sendTelegramTextWithDiagnostics({
              client: db as unknown as TelegramSendDiagnosticsWriteDb,
              fetchImpl: globalThis.fetch,
              message: {
                apiBaseUrl: config.apiBaseUrl,
                botToken: config.botToken,
                chatId,
                text,
              },
              operation: "WEBHOOK_REPLY",
            });
            if (normalized.outcome === "failed") {
              return {
                errorCode: normalized.errorCode,
                httpStatus: normalized.httpStatus,
              };
            }
          },
        );
      },
    );
}
