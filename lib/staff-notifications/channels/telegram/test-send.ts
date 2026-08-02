import {
  sendTelegramTextWithDiagnostics,
  type TelegramTextSendErrorCode,
} from "@/lib/staff-notifications/channels/telegram/adapter";
import type { TelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config-values";
import { TELEGRAM_TEST_SEND_COOLDOWN_MS } from "@/lib/staff-notifications/channels/telegram/constants";
import type { TelegramSendDiagnosticsWriteDb } from "@/lib/staff-notifications/channels/telegram/diagnostics";
import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

export const TELEGRAM_TEST_NOTIFICATION_TEXT = [
  "🧪 ТЕСТОВОЕ уведомление Geleoteka",
  "Это проверка рабочего канала Telegram. Бизнес-событие не произошло.",
].join("\n");

export type TelegramTestTarget = "PERSONAL" | "SHARED";

export type TelegramTestNotificationResult =
  | {
      outcome: "sent";
      durationMs: number;
    }
  | {
      outcome: "failed";
      durationMs: number;
      errorCode:
        | TelegramTextSendErrorCode
        | "TELEGRAM_DISABLED"
        | "TELEGRAM_DESTINATION_UNAVAILABLE";
    }
  | {
      outcome: "rate-limited";
      retryAfterMs: number;
      errorCode: "TELEGRAM_TEST_RATE_LIMITED";
    };

export interface TelegramTestSendDb extends TelegramSendDiagnosticsWriteDb {
  telegramDestination: {
    findFirst(args: QueryArgs): Promise<unknown>;
  };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

interface DestinationRow {
  chatId: string;
}

interface ThrottleResultRow {
  acquired: boolean;
  retryAfterMs: number;
}

/**
 * Sends directly to the server-selected active destination through the same
 * Bot API sender and diagnostic recorder as production delivery. The browser
 * never supplies a destination id or Telegram address.
 */
export async function sendTelegramTestNotification(options: {
  client: TelegramTestSendDb;
  fetchImpl: typeof fetch;
  config: TelegramRuntimeConfig;
  actorUserId: string;
  target: TelegramTestTarget;
  monotonicNow?: () => number;
}): Promise<TelegramTestNotificationResult> {
  const destination = (await options.client.telegramDestination.findFirst({
    where: {
      tenantKey: TENANT_KEY,
      kind: options.target,
      userId: options.target === "PERSONAL" ? options.actorUserId : null,
      isActive: true,
      disabledAt: null,
    },
    orderBy: { verifiedAt: "desc" },
    select: { chatId: true },
  })) as DestinationRow | null;

  if (!destination) {
    return {
      outcome: "failed",
      durationMs: 0,
      errorCode: "TELEGRAM_DESTINATION_UNAVAILABLE",
    };
  }
  if (!options.config.enabled) {
    return {
      outcome: "failed",
      durationMs: 0,
      errorCode: "TELEGRAM_DISABLED",
    };
  }

  const throttle = await acquireTelegramTestSendSlot(
    options.client,
    options.actorUserId,
  );
  if (!throttle.acquired) {
    return {
      outcome: "rate-limited",
      retryAfterMs: throttle.retryAfterMs,
      errorCode: "TELEGRAM_TEST_RATE_LIMITED",
    };
  }

  const result = await sendTelegramTextWithDiagnostics({
    client: options.client,
    fetchImpl: options.fetchImpl,
    message: {
      apiBaseUrl: options.config.apiBaseUrl,
      botToken: options.config.botToken,
      chatId: destination.chatId,
      text: TELEGRAM_TEST_NOTIFICATION_TEXT,
    },
    operation: "TEST_NOTIFICATION",
    monotonicNow: options.monotonicNow,
  });

  if (result.outcome === "sent") {
    return { outcome: "sent", durationMs: result.durationMs };
  }
  return {
    outcome: "failed",
    durationMs: result.durationMs,
    errorCode: result.errorCode,
  };
}

async function acquireTelegramTestSendSlot(
  client: TelegramTestSendDb,
  actorUserId: string,
): Promise<ThrottleResultRow> {
  const rows = await client.$queryRaw<ThrottleResultRow[]>`
    WITH acquired AS (
      INSERT INTO "TelegramTestSendThrottle" (
        "tenantKey",
        "actorUserId",
        "attemptedAt"
      )
      VALUES (${TENANT_KEY}, ${actorUserId}, CURRENT_TIMESTAMP)
      ON CONFLICT ("tenantKey", "actorUserId") DO UPDATE
        SET "attemptedAt" = EXCLUDED."attemptedAt"
        WHERE "TelegramTestSendThrottle"."attemptedAt"
          <= CURRENT_TIMESTAMP - (${TELEGRAM_TEST_SEND_COOLDOWN_MS} * INTERVAL '1 millisecond')
      RETURNING "attemptedAt"
    )
    SELECT TRUE AS "acquired", 0::integer AS "retryAfterMs"
    FROM acquired
    UNION ALL
    SELECT
      FALSE AS "acquired",
      GREATEST(
        0,
        CEIL(
          EXTRACT(
            EPOCH FROM (
              throttle."attemptedAt"
              + (${TELEGRAM_TEST_SEND_COOLDOWN_MS} * INTERVAL '1 millisecond')
              - CURRENT_TIMESTAMP
            )
          ) * 1000
        )::integer
      ) AS "retryAfterMs"
    FROM "TelegramTestSendThrottle" AS throttle
    WHERE throttle."tenantKey" = ${TENANT_KEY}
      AND throttle."actorUserId" = ${actorUserId}
      AND NOT EXISTS (SELECT 1 FROM acquired)
  `;

  return rows[0] ?? {
    acquired: false,
    retryAfterMs: TELEGRAM_TEST_SEND_COOLDOWN_MS,
  };
}
