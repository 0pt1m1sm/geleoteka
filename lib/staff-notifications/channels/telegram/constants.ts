export const TELEGRAM_ROUTING_MODES = [
  "PERSONAL_ONLY",
  "PERSONAL_WITH_SHARED_FALLBACK",
] as const;

export type TelegramRoutingMode = (typeof TELEGRAM_ROUTING_MODES)[number];

export const TELEGRAM_LINK_TOKEN_BYTES = 32;
export const TELEGRAM_LINK_TOKEN_TTL_MS = 30 * 60_000;
export const TELEGRAM_SEND_TIMEOUT_MS = 10_000;
export const TELEGRAM_TEST_SEND_COOLDOWN_MS = 60_000;

export const TELEGRAM_WEBHOOK_SECRET_HEADER =
  "x-telegram-bot-api-secret-token";

/**
 * Bot API host. Overridable because RKN throttles Telegram↔RU traffic: with a
 * relay outside Russia the owner points TELEGRAM_API_BASE_URL at it and every
 * outbound call — sends AND getUpdates polling — goes through the relay.
 */
export const TELEGRAM_DEFAULT_API_BASE_URL = "https://api.telegram.org";

/**
 * Update polling. Short polls (timeout=0) on purpose: drains run inside HTTP
 * requests (cron ticks and link-status checks), where a hanging long poll
 * would block the caller. The cadence comes from the callers, not from here.
 */
export const TELEGRAM_POLL_REQUEST_TIMEOUT_MS = 8_000;
export const TELEGRAM_POLL_BATCH_LIMIT = 100;
export const TELEGRAM_POLL_COOLDOWN_MS = 4_000;

/**
 * A deterministically-failing update would otherwise stay first in the queue
 * forever and block everything behind it. After this many failed drains in a
 * row the cursor is advanced past it (quarantine) with a diagnostic record.
 */
export const TELEGRAM_POLL_POISON_MAX_ATTEMPTS = 3;

/**
 * Попытки карантина считаются не чаще этого интервала: панель дёргает drain
 * каждые ~5 секунд, и без spacing короткий сбой БД сжёг бы все попытки за
 * секунды, необратимо выбросив живой апдейт.
 */
export const TELEGRAM_POLL_POISON_ATTEMPT_SPACING_MS = 60_000;

/**
 * Single-flight lease: ровно один drain на bot token в каждый момент. Второй
 * параллельный getUpdates глазами Telegram — это 409 «terminated by other
 * getUpdates request», неотличимый по HTTP-коду от 409 «webhook is active».
 * Срок должен с запасом покрывать худший drain (бюджет + сетевые хвосты).
 */
export const TELEGRAM_POLL_LEASE_MS = 30_000;
