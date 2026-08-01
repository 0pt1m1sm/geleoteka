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
  parameters?: { retry_after?: number };
  result?: { message_id?: number | string };
}

const REQUEST_TIMEOUT_MS = 10_000;

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    // The Bot API requires the credential in the URL. This URL must never be
    // logged or surfaced in an exception/error response.
    response = await dependencies.fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: destination.chatId,
          text,
          protect_content: true,
          link_preview_options: { is_disabled: true },
        }),
        signal: controller.signal,
      },
    );
  } catch {
    return { outcome: "retry" as const, errorCode: "TELEGRAM_NETWORK" };
  } finally {
    clearTimeout(timeout);
  }

  const body = await readTelegramResponse(response);
  if (response.ok && body?.ok === true) {
    const messageId = body.result?.message_id;
    return {
      outcome: "sent" as const,
      providerMessageId:
        typeof messageId === "number" || typeof messageId === "string"
          ? String(messageId)
          : null,
    };
  }

  const status = body?.error_code ?? response.status;
  const description = body?.description?.toLowerCase() ?? "";
  if (status === 429) {
    const retryAfterSeconds = body?.parameters?.retry_after;
    const retryAfterMs =
      typeof retryAfterSeconds === "number" &&
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds > 0
        ? Math.ceil(retryAfterSeconds * 1000)
        : undefined;
    return {
      outcome: "retry" as const,
      errorCode: "TELEGRAM_RATE_LIMITED",
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }

  const chatNotFound = status === 400 && description.includes("chat not found");
  const botBlocked = status === 403 && description.includes("bot was blocked");
  if (chatNotFound || botBlocked) {
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
      errorCode: chatNotFound ? "TELEGRAM_CHAT_NOT_FOUND" : "TELEGRAM_BOT_BLOCKED",
    };
  }

  return {
    outcome: "retry" as const,
    errorCode: status === 401 ? "TELEGRAM_AUTH_REJECTED" : "TELEGRAM_REJECTED",
  };
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
