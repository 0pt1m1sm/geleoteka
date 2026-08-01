export const TELEGRAM_ROUTING_MODES = [
  "PERSONAL_ONLY",
  "PERSONAL_WITH_SHARED_FALLBACK",
] as const;

export type TelegramRoutingMode = (typeof TELEGRAM_ROUTING_MODES)[number];

export const TELEGRAM_LINK_TOKEN_BYTES = 32;
export const TELEGRAM_LINK_TOKEN_TTL_MS = 10 * 60_000;

export const TELEGRAM_WEBHOOK_SECRET_HEADER =
  "x-telegram-bot-api-secret-token";

