import type { StaffNotificationChannelAdapter } from "@/lib/staff-notifications/channels";
import type { TelegramRuntimeConfig } from "@/lib/staff-notifications/channels/telegram/config-values";
import { formatTelegramStaffNotification } from "@/lib/staff-notifications/channels/telegram/format";
import type { SafeChannelPayload } from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

export interface TelegramAdapterDb {
  telegramDestination: {
    findUnique(args: QueryArgs): Promise<unknown>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
}

export interface TelegramAdapterDependencies {
  db: TelegramAdapterDb;
  fetch: typeof fetch;
  loadConfig: () => Promise<TelegramRuntimeConfig>;
  now?: () => Date;
}

interface DestinationRow {
  id: string;
  chatId: string;
  isActive: boolean;
  disabledAt: Date | null;
}

interface TelegramApiResponse {
  ok?: boolean;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
  result?: { message_id?: number | string };
}

const REQUEST_TIMEOUT_MS = 10_000;

export interface TelegramTextMessage {
  botToken: string;
  chatId: string;
  text: string;
}

export type TelegramTextSendResult =
  | { outcome: "network-error" }
  | {
      outcome: "response";
      response: Response;
      body: TelegramApiResponse | null;
    };

export type TelegramTextSendErrorCode =
  | "TELEGRAM_NETWORK"
  | "TELEGRAM_CHAT_MIGRATED"
  | "TELEGRAM_RATE_LIMITED"
  | "TELEGRAM_CHAT_NOT_FOUND"
  | "TELEGRAM_BOT_BLOCKED"
  | "TELEGRAM_AUTH_REJECTED"
  | "TELEGRAM_REJECTED";

export type NormalizedTelegramTextSendResult =
  | {
      outcome: "sent";
      providerMessageId: string | null;
    }
  | {
      outcome: "failed";
      errorCode: TelegramTextSendErrorCode;
      httpStatus: number | null;
      retryAfterMs?: number;
      migratedChatId?: string;
    };

export function createTelegramChannelAdapter(
  dependencies: TelegramAdapterDependencies,
): StaffNotificationChannelAdapter {
  return {
    async send(destinationKey, payload) {
      return sendTelegramNotification(dependencies, destinationKey, payload);
    },
  };
}

async function sendTelegramNotification(
  dependencies: TelegramAdapterDependencies,
  destinationKey: string,
  payload: SafeChannelPayload,
) {
  const config = await dependencies.loadConfig();
  if (!config.enabled || !config.enabledEventTypes.has(payload.type)) {
    return { outcome: "retry" as const, errorCode: "TELEGRAM_DISABLED" };
  }
  if (payload.occurredAt < config.enabledAt) {
    return {
      outcome: "dead" as const,
      errorCode: "EVENT_BEFORE_CHANNEL_CUTOVER",
    };
  }

  const destination = (await dependencies.db.telegramDestination.findUnique({
    where: { tenantKey_id: { tenantKey: TENANT_KEY, id: destinationKey } },
    select: { id: true, chatId: true, isActive: true, disabledAt: true },
  })) as DestinationRow | null;
  if (!destination || !destination.isActive || destination.disabledAt !== null) {
    return { outcome: "dead" as const, errorCode: "DESTINATION_UNAVAILABLE" };
  }

  let text: string;
  try {
    text = formatTelegramStaffNotification(payload, config.applicationOrigin);
  } catch {
    return { outcome: "dead" as const, errorCode: "INVALID_SAFE_PAYLOAD" };
  }

  const sent = await sendTelegramText(dependencies.fetch, {
    botToken: config.botToken,
    chatId: destination.chatId,
    text,
  });
  const normalized = normalizeTelegramTextSendResult(sent);
  if (normalized.outcome === "sent") {
    return {
      outcome: "sent" as const,
      providerMessageId: normalized.providerMessageId,
    };
  }

  if (
    normalized.errorCode === "TELEGRAM_CHAT_MIGRATED" &&
    normalized.migratedChatId
  ) {
    await dependencies.db.telegramDestination.updateMany({
      where: {
        tenantKey: TENANT_KEY,
        id: destination.id,
        chatId: destination.chatId,
      },
      data: { chatId: normalized.migratedChatId },
    });
    return {
      outcome: "retry" as const,
      errorCode: normalized.errorCode,
    };
  }
  if (normalized.errorCode === "TELEGRAM_RATE_LIMITED") {
    return {
      outcome: "retry" as const,
      errorCode: normalized.errorCode,
      ...(normalized.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: normalized.retryAfterMs }),
    };
  }

  if (
    normalized.errorCode === "TELEGRAM_CHAT_NOT_FOUND" ||
    normalized.errorCode === "TELEGRAM_BOT_BLOCKED"
  ) {
    await dependencies.db.telegramDestination.updateMany({
      where: {
        tenantKey: TENANT_KEY,
        id: destination.id,
        isActive: true,
        disabledAt: null,
      },
      data: {
        isActive: false,
        disabledAt: (dependencies.now ?? (() => new Date()))(),
      },
    });
    return {
      outcome: "dead" as const,
      errorCode: normalized.errorCode,
    };
  }

  return {
    outcome: "retry" as const,
    errorCode: normalized.errorCode,
  };
}

/**
 * Turn every Bot API result into the same closed, secret-free classification.
 * Notification delivery and webhook courtesy replies must not invent separate
 * interpretations of the provider response.
 */
export function normalizeTelegramTextSendResult(
  sent: TelegramTextSendResult,
): NormalizedTelegramTextSendResult {
  if (sent.outcome === "network-error") {
    return {
      outcome: "failed",
      errorCode: "TELEGRAM_NETWORK",
      httpStatus: null,
    };
  }

  const { response, body } = sent;
  if (response.ok && body?.ok === true) {
    const messageId = body.result?.message_id;
    return {
      outcome: "sent",
      providerMessageId:
        typeof messageId === "number" || typeof messageId === "string"
          ? String(messageId)
          : null,
    };
  }

  const providerStatus = body?.error_code ?? response.status;
  const description = body?.description?.toLowerCase() ?? "";
  const migratedChatId = telegramIntegerId(body?.parameters?.migrate_to_chat_id);
  if (providerStatus === 400 && migratedChatId) {
    return {
      outcome: "failed",
      errorCode: "TELEGRAM_CHAT_MIGRATED",
      httpStatus: response.status,
      migratedChatId,
    };
  }
  if (providerStatus === 429) {
    const retryAfterSeconds = body?.parameters?.retry_after;
    const retryAfterMs =
      typeof retryAfterSeconds === "number" &&
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds > 0
        ? Math.ceil(retryAfterSeconds * 1000)
        : undefined;
    return {
      outcome: "failed",
      errorCode: "TELEGRAM_RATE_LIMITED",
      httpStatus: response.status,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if (providerStatus === 400 && description.includes("chat not found")) {
    return {
      outcome: "failed",
      errorCode: "TELEGRAM_CHAT_NOT_FOUND",
      httpStatus: response.status,
    };
  }
  if (providerStatus === 403 && description.includes("bot was blocked")) {
    return {
      outcome: "failed",
      errorCode: "TELEGRAM_BOT_BLOCKED",
      httpStatus: response.status,
    };
  }
  return {
    outcome: "failed",
    errorCode:
      providerStatus === 401 ? "TELEGRAM_AUTH_REJECTED" : "TELEGRAM_REJECTED",
    httpStatus: response.status,
  };
}

export async function sendTelegramText(
  fetchImpl: typeof fetch,
  message: TelegramTextMessage,
): Promise<TelegramTextSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // The Bot API requires the credential in the URL. This URL must never be
    // logged or surfaced in an exception/error response.
    const response = await fetchImpl(
      `https://api.telegram.org/bot${message.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chatId,
          text: message.text,
          protect_content: true,
          link_preview_options: { is_disabled: true },
        }),
        signal: controller.signal,
      },
    );
    const body = await readTelegramResponse(response);
    if (controller.signal.aborted) {
      return { outcome: "network-error" };
    }
    return { outcome: "response", response, body };
  } catch {
    return { outcome: "network-error" };
  } finally {
    clearTimeout(timeout);
  }
}

function telegramIntegerId(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : null;
}

async function readTelegramResponse(response: Response): Promise<TelegramApiResponse | null> {
  try {
    const value = (await response.json()) as unknown;
    return value !== null && typeof value === "object"
      ? (value as TelegramApiResponse)
      : null;
  } catch {
    return null;
  }
}
