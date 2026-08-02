import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { constantTimeSecretEqual } from "@/lib/security/constant-time";
import { telegramApiMethodUrl } from "@/lib/staff-notifications/channels/telegram/adapter";
import {
  loadStaffNotificationDispatchSecret,
  loadTelegramRuntimeConfig,
} from "@/lib/staff-notifications/channels/telegram/config";
import {
  normalizeTelegramApiBaseUrl,
  normalizeTelegramBotToken,
  normalizeTelegramBotUsername,
  normalizeTelegramEnabledAt,
  normalizeTelegramRoutingMode,
} from "@/lib/staff-notifications/channels/telegram/config-values";
import { readBackgroundWorkerHeartbeat } from "@/lib/staff-notifications/channels/telegram/poll-worker";
import { drainTelegramUpdatesNow } from "@/lib/staff-notifications/channels/telegram/updates-runtime";
import { runStaffNotificationDispatchTick } from "@/lib/staff-notifications/dispatch-runtime";
import { TENANT_KEY } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 8_000;

/**
 * Диагностика Telegram-канала для эксплуатации: живые пробы Bot API, срез
 * состояния опроса и последних попыток, опциональный принудительный drain.
 * Отдаёт ТОЛЬКО безопасную проекцию — булевы признаки, нормализованные коды,
 * счётчики, длительности. Ни токена, ни chat_id, ни каких-либо URL (включая
 * webhook) в ответе нет и быть не должно. Auth — тот же Bearer-секрет, что у
 * maintenance/dispatch; дергается вручную или workflow'ом telegram-diagnostics.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = await loadStaffNotificationDispatchSecret();
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const authorization = request.headers.get("authorization") ?? "";
  const presented = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!presented || !constantTimeSecretEqual(presented, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    drain?: boolean;
    dispatch?: boolean;
    /** Сбросить nextAttemptAt застрявших RETRY на «сейчас» (перед dispatch). */
    nudge?: boolean;
  } | null;

  try {
    const config = await loadTelegramRuntimeConfig();
    const fields = await diagnoseConfigFields();

    const telegram = config.enabled
      ? {
          getMe: await probeGetMe(config.apiBaseUrl, config.botToken),
          webhook: await probeWebhookInfo(config.apiBaseUrl, config.botToken),
        }
      : null;

    // Drain до чтения среза, чтобы pollState/recentPolls показывали свежий
    // результат. Бюджет больше кронового: диагностике важно дойти до конца
    // самолечения (getUpdates → getWebhookInfo → deleteWebhook → getUpdates)
    // даже при ~5с на вызов через замедленный канал.
    const drain =
      body?.drain === true && config.enabled
        ? await drainTelegramUpdatesNow({
            force: true,
            budgetMs: 25_000,
            maxBatches: 3,
          })
        : null;

    // Экспоненциальный бэкофф после серии сбоев уводит ретрай на часы; когда
    // причина сбоев уже исправлена деплоем, ждать нечего — возвращаем
    // застрявшие RETRY в очередь «сейчас».
    const nudged =
      body?.nudge === true
        ? ((await db.staffNotificationDelivery.updateMany({
            where: { tenantKey: TENANT_KEY, status: "RETRY" },
            data: { nextAttemptAt: new Date() },
          })) as { count: number })
        : null;

    // Ручной dispatch-тик: пинок доставкам, когда фоновый воркер мёртв или
    // под подозрением. Тот же код, что у воркера и cron-роута.
    const dispatch =
      body?.dispatch === true ? await runStaffNotificationDispatchTick() : null;

    const pollState = (await db.telegramPollState.findUnique({
      where: { tenantKey: TENANT_KEY },
    })) as {
      nextOffset: bigint | number;
      lastDrainStartedAt: Date | null;
      stuckUpdateId: bigint | number | null;
      stuckAttempts: number;
      stuckLastAt: Date | null;
      leaseUntil: Date | null;
    } | null;

    const now = new Date();
    const [recentEvents, recentDeliveries] = await Promise.all([
      (async () => {
        const rows = (await db.staffNotificationEvent.findMany({
          where: { tenantKey: TENANT_KEY },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { type: true, occurredAt: true, createdAt: true },
        })) as Array<{ type: string; occurredAt: Date; createdAt: Date }>;
        return rows.map((row) => ({
          type: row.type,
          occurredAt: row.occurredAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
        }));
      })(),
      (async () => {
        const rows = (await db.staffNotificationDelivery.findMany({
          where: { tenantKey: TENANT_KEY },
          orderBy: { nextAttemptAt: "desc" },
          take: 5,
          select: {
            status: true,
            attempts: true,
            lastErrorCode: true,
            nextAttemptAt: true,
            sentAt: true,
            event: { select: { type: true, occurredAt: true } },
          },
        })) as unknown as Array<{
          status: string;
          attempts: number;
          lastErrorCode: string | null;
          nextAttemptAt: Date;
          sentAt: Date | null;
          event: { type: string; occurredAt: Date } | null;
        }>;
        return rows.map((row) => ({
          status: row.status,
          attempts: row.attempts,
          lastErrorCode: row.lastErrorCode,
          nextAttemptAt: row.nextAttemptAt.toISOString(),
          sentAt: row.sentAt?.toISOString() ?? null,
          eventType: row.event?.type ?? null,
          eventOccurredAt: row.event?.occurredAt.toISOString() ?? null,
        }));
      })(),
    ]);
    const [recentPolls, recentReplies, recentNotificationSends, activeLinkTokens, destinations] =
      await Promise.all([
        recentAttempts("UPDATES_POLL"),
        recentAttempts("WEBHOOK_REPLY"),
        recentAttempts("NOTIFICATION_DELIVERY"),
        db.telegramLinkToken.count({
          where: { tenantKey: TENANT_KEY, usedAt: null, expiresAt: { gt: now } },
        }) as Promise<number>,
        Promise.all([
          db.telegramDestination.count({
            where: { tenantKey: TENANT_KEY },
          }) as Promise<number>,
          db.telegramDestination.count({
            where: { tenantKey: TENANT_KEY, isActive: true },
          }) as Promise<number>,
        ]),
      ]);

    return NextResponse.json({
      ok: true,
      at: now.toISOString(),
      config: config.enabled
        ? { enabled: true }
        : { enabled: false, reason: config.reason },
      fields,
      telegram,
      // Живость фонового контура: null-времена или старый lastIterationAt
      // при живом сайте = воркер мёртв/не стартовал.
      worker: readBackgroundWorkerHeartbeat(),
      drain,
      nudged,
      dispatch,
      // Пусто при живом конвейере = отправки падают ДО сети (класс
      // ADAPTER_EXCEPTION); непусто — виден настоящий сетевой код.
      recentNotificationSends,
      pollState: pollState
        ? {
            nextOffset: Number(pollState.nextOffset),
            lastDrainStartedAt: pollState.lastDrainStartedAt?.toISOString() ?? null,
            stuckUpdateId:
              pollState.stuckUpdateId === null
                ? null
                : Number(pollState.stuckUpdateId),
            stuckAttempts: pollState.stuckAttempts,
            stuckLastAt: pollState.stuckLastAt?.toISOString() ?? null,
            leaseUntil: pollState.leaseUntil?.toISOString() ?? null,
          }
        : null,
      recentPolls,
      recentReplies,
      // Событийный конвейер: только типы/статусы/времена/коды — без
      // summary и каких-либо текстов.
      recentEvents,
      recentDeliveries,
      linkTokens: { active: activeLinkTokens },
      destinations: { total: destinations[0], active: destinations[1] },
    });
  } catch {
    return NextResponse.json({ error: "diagnostics failed" }, { status: 500 });
  }
}

async function recentAttempts(
  operation: "UPDATES_POLL" | "WEBHOOK_REPLY" | "NOTIFICATION_DELIVERY",
): Promise<Array<Record<string, unknown>>> {
  const rows = (await db.telegramSendAttempt.findMany({
    where: { tenantKey: TENANT_KEY, operation },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      createdAt: true,
      outcome: true,
      durationMs: true,
      isSlow: true,
      errorCode: true,
    },
  })) as Array<{
    createdAt: Date;
    outcome: string;
    durationMs: number;
    isSlow: boolean;
    errorCode: string | null;
  }>;
  return rows.map((row) => ({
    at: row.createdAt.toISOString(),
    outcome: row.outcome,
    durationMs: row.durationMs,
    isSlow: row.isSlow,
    errorCode: row.errorCode,
  }));
}

/** Покомпонентный вердикт конфигурации — что именно валит invalid-config. */
async function diagnoseConfigFields(): Promise<Record<string, string | boolean>> {
  const [enabled, enabledAt, token, username, routing, baseUrl] =
    await Promise.all([
      getSetting("TELEGRAM_ENABLED"),
      getSetting("TELEGRAM_ENABLED_AT"),
      getSetting("TELEGRAM_BOT_TOKEN"),
      getSetting("TELEGRAM_BOT_USERNAME"),
      getSetting("TELEGRAM_ROUTING_MODE"),
      getSetting("TELEGRAM_API_BASE_URL"),
    ]);
  return {
    enabledFlag: enabled === "true",
    enabledAt: normalizeTelegramEnabledAt(enabledAt) ? "ok" : "missing-or-invalid",
    botToken: normalizeTelegramBotToken(token) ? "ok" : "missing-or-invalid",
    botUsername: normalizeTelegramBotUsername(username)
      ? "ok"
      : "missing-or-invalid",
    routingMode: normalizeTelegramRoutingMode(routing) ?? "missing-or-invalid",
    apiBaseUrl: normalizeTelegramApiBaseUrl(baseUrl) ? "ok" : "invalid",
  };
}

async function probeGetMe(
  apiBaseUrl: string,
  botToken: string,
): Promise<string> {
  const response = await probeCall(apiBaseUrl, botToken, "getMe");
  if (response === "timeout" || response === "network") return response;
  if (response.status === 401) return "auth-rejected";
  return response.ok ? "ok" : "rejected";
}

async function probeWebhookInfo(
  apiBaseUrl: string,
  botToken: string,
): Promise<{ registered: boolean | null; pendingUpdates: number | null }> {
  const response = await probeCall(apiBaseUrl, botToken, "getWebhookInfo");
  if (response === "timeout" || response === "network" || !response.ok) {
    return { registered: null, pendingUpdates: null };
  }
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { url?: unknown; pending_update_count?: unknown };
  } | null;
  if (body?.ok !== true) return { registered: null, pendingUpdates: null };
  return {
    // Только непустота: сам url — секретоноситель и наружу не отдаётся.
    registered:
      typeof body.result?.url === "string" && body.result.url.length > 0,
    pendingUpdates:
      typeof body.result?.pending_update_count === "number"
        ? body.result.pending_update_count
        : 0,
  };
}

async function probeCall(
  apiBaseUrl: string,
  botToken: string,
  method: string,
): Promise<Response | "timeout" | "network"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(telegramApiMethodUrl(apiBaseUrl, botToken, method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
  } catch {
    return controller.signal.aborted ? "timeout" : "network";
  } finally {
    clearTimeout(timer);
  }
}
