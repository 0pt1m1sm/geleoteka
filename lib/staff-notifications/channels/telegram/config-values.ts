import { parseBooleanSetting } from "@/lib/settings-shared";
import {
  TELEGRAM_ROUTING_MODES,
  type TelegramRoutingMode,
} from "@/lib/staff-notifications/channels/telegram/constants";
import {
  STAFF_NOTIFICATION_EVENT_CATALOG,
  type StaffNotificationType,
} from "@/lib/staff-notifications/types";

const BOT_TOKEN_RE = /^\d{5,16}:[A-Za-z0-9_-]{20,200}$/;
const BOT_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{1,27}[Bb][Oo][Tt]$/;
const WEBHOOK_SECRET_RE = /^[A-Za-z0-9_-]{32,256}$/;
const DISPATCH_SECRET_RE = /^[\x21-\x7e]{32,256}$/;

export const TELEGRAM_CORE_SETTING_KEYS = [
  "TELEGRAM_ENABLED",
  "TELEGRAM_ENABLED_AT",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_ROUTING_MODE",
] as const;

export const TELEGRAM_EVENT_SETTING_KEYS = Object.freeze(
  Object.keys(STAFF_NOTIFICATION_EVENT_CATALOG).map(
    (type) => `TELEGRAM_NOTIFY_${type}`,
  ),
);

export type TelegramSettingValues = Readonly<
  Record<string, string | null | undefined>
>;

export type TelegramRuntimeConfig =
  | {
      enabled: false;
      reason: "disabled" | "invalid-config";
      enabledEventTypes: ReadonlySet<StaffNotificationType>;
    }
  | {
      enabled: true;
      enabledAt: Date;
      botToken: string;
      botUsername: string;
      webhookSecret: string;
      routingMode: TelegramRoutingMode;
      applicationOrigin: string;
      enabledEventTypes: ReadonlySet<StaffNotificationType>;
    };

export function resolveTelegramRuntimeConfig(
  values: TelegramSettingValues,
  applicationUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru",
): TelegramRuntimeConfig {
  const enabledEventTypes = new Set<StaffNotificationType>();
  for (const type of Object.keys(
    STAFF_NOTIFICATION_EVENT_CATALOG,
  ) as StaffNotificationType[]) {
    if (parseBooleanSetting(values[`TELEGRAM_NOTIFY_${type}`])) {
      enabledEventTypes.add(type);
    }
  }

  if (!parseBooleanSetting(values.TELEGRAM_ENABLED)) {
    return { enabled: false, reason: "disabled", enabledEventTypes };
  }

  const enabledAt = normalizeTelegramEnabledAt(values.TELEGRAM_ENABLED_AT);
  const botToken = normalizeTelegramBotToken(values.TELEGRAM_BOT_TOKEN);
  const botUsername = normalizeTelegramBotUsername(values.TELEGRAM_BOT_USERNAME);
  const webhookSecret = normalizeTelegramWebhookSecret(
    values.TELEGRAM_WEBHOOK_SECRET,
  );
  const routingMode = normalizeTelegramRoutingMode(values.TELEGRAM_ROUTING_MODE);
  const applicationOrigin = normalizeApplicationOrigin(applicationUrl);

  if (
    !enabledAt ||
    !botToken ||
    !botUsername ||
    !webhookSecret ||
    !routingMode ||
    !applicationOrigin
  ) {
    return { enabled: false, reason: "invalid-config", enabledEventTypes };
  }

  return {
    enabled: true,
    enabledAt,
    botToken,
    botUsername,
    webhookSecret,
    routingMode,
    applicationOrigin,
    enabledEventTypes,
  };
}

export function normalizeTelegramEnabledAt(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)) {
    return null;
  }
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === normalized
    ? parsed
    : null;
}

export function normalizeTelegramBotToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return BOT_TOKEN_RE.test(normalized) ? normalized : null;
}

export function normalizeTelegramBotUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return BOT_USERNAME_RE.test(normalized) ? normalized : null;
}

export function normalizeTelegramWebhookSecret(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return WEBHOOK_SECRET_RE.test(normalized) ? normalized : null;
}

export function normalizeStaffNotificationDispatchSecret(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return DISPATCH_SECRET_RE.test(normalized) ? normalized : null;
}

export function normalizeTelegramRoutingMode(
  value: unknown,
): TelegramRoutingMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return (TELEGRAM_ROUTING_MODES as readonly string[]).includes(normalized)
    ? (normalized as TelegramRoutingMode)
    : null;
}

function normalizeApplicationOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localHttp) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/") return null;
  return url.origin;
}
