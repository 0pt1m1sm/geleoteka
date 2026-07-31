import "server-only";
import { db } from "@/lib/db";

/**
 * Runtime-mutable settings store. Admin can override env-driven values via
 * /admin/settings/integrations without redeploy.
 *
 * Resolution order: DB row → process.env[envFallback] → null.
 *
 * Cache: in-process Map, 60s TTL. CRM actions that update a setting call
 * `invalidateSetting(key)` to drop the cache on the writing instance — other
 * Railway replicas pick up the new value within 60s. For low-frequency
 * settings (webhook secrets, integration creds) this is fine.
 */
const CACHE = new Map<string, { value: string | null; expiresAt: number }>();
const TTL_MS = 60_000;


export interface SettingDescriptor {
  /** Setting key (also the DB row's `key`). */
  key: string;
  /** Env var name read as fallback when no DB row exists. */
  envFallback?: string;
  /** Display label for admin UI. */
  label: string;
  /** Help text shown under the input. */
  description?: string;
  /** When true, value is hidden by default in the form (passwords / secrets). */
  secret?: boolean;
  /** Visual group on the settings page (Russian label). */
  group: string;
}

/**
 * Single source of truth for which keys are surfaced in the admin
 * /admin/settings/integrations page. Add a new entry here, no other code
 * change required to expose a new setting — plus update any consumer to
 * read via getSetting() instead of process.env directly.
 *
 * NOT included (intentionally — boot-time / client-bundle deps):
 *   - DATABASE_URL — Prisma needs it before any DB read
 *   - JWT_SECRET — verified per request; rotation invalidates all sessions
 *   - NEXT_PUBLIC_* — baked into the client bundle at build time
 */
export const KNOWN_SETTINGS: ReadonlyArray<SettingDescriptor> = [
  // ── Email (отправка / transport) ─────────────────────────────────────
  // Провайдер-нейтральная отправка: дефолт — generic SMTP (nodemailer),
  // host/port/креды конфигурируемы на тенант/автосервис. Resend — опциональный
  // legacy-адаптер (ниже), включается только EMAIL_TRANSPORT=resend.
  // ПАРОЛЬ SMTP — ТОЛЬКО secret env (SMTP_PASSWORD), НЕ в этой таблице.
  {
    group: "Email (отправка)",
    key: "EMAIL_TRANSPORT",
    label: "Транспорт отправки",
    description:
      "smtp (по умолчанию) — generic SMTP через nodemailer. resend — опциональный legacy-адаптер. Автопереключения между провайдерами нет (риск двойной отправки): смена значения = одно осознанное изменение конфига.",
  },
  {
    group: "Email (отправка)",
    key: "EMAIL_FROM",
    label: "Отправитель (From)",
    description:
      "Формат: «Geleoteka <sales@geleoteka.ru>». Единый видимый From для любого транспорта. Если пусто — берётся legacy RESEND_FROM / RESEND_FROM_FALLBACK.",
  },
  {
    group: "Email (отправка)",
    key: "EMAIL_REPLY_TO",
    label: "Reply-To",
    description:
      "Адрес для ответов клиента. По умолчанию sales@geleoteka.ru. Должен быть реальным ящиком, чтобы ответы попадали в CRM.",
  },
  {
    group: "Email (отправка)",
    key: "SMTP_HOST",
    label: "SMTP host",
    description:
      "Для Гелеотеки — smtp.timeweb.ru. Для другого тенанта — его сервер. По умолчанию smtp.timeweb.ru. Только TLS.",
  },
  {
    group: "Email (отправка)",
    key: "SMTP_PORT",
    label: "SMTP порт",
    description: "465 (implicit TLS, по умолчанию) или 587 (STARTTLS). Открытый 25 не использовать.",
  },
  {
    group: "Email (отправка)",
    key: "SMTP_SECURE",
    label: "SMTP implicit TLS",
    description:
      "true для 465 (implicit TLS), false для 587 (STARTTLS с обязательным апгрейдом). Если пусто — выводится из порта.",
  },
  {
    group: "Email (отправка)",
    key: "SMTP_USER",
    label: "SMTP логин",
    description:
      "Логин SMTP = полный адрес отправляющего ящика (сервисный, не пароль менеджера). Пароль задаётся ТОЛЬКО в env SMTP_PASSWORD, не здесь.",
  },

  // ── Email (Resend — LEGACY, опциональный) ────────────────────────────
  // Работает только при EMAIL_TRANSPORT=resend. Оставлен как переходный
  // адаптер и будет удалён после катовера на SMTP (план Task 6–7). Входящий
  // Resend webhook (ниже) пока остаётся единственным рабочим inbound.
  {
    group: "Email (Resend, legacy)",
    key: "RESEND_API_KEY",
    label: "Resend API key",
    description:
      "Только для EMAIL_TRANSPORT=resend. Без неё resend-отправка работает в mock-режиме (логируется, не отправляется).",
    secret: true,
  },
  {
    group: "Email (Resend, legacy)",
    key: "RESEND_FROM",
    label: "Отправитель (verified domain)",
    description:
      "Legacy-фолбэк для EMAIL_FROM. Формат: «Geleoteka <sales@geleoteka.ru>». Используется когда EMAIL_FROM пуст.",
  },
  {
    group: "Email (Resend, legacy)",
    key: "RESEND_FROM_FALLBACK",
    label: "Отправитель (fallback)",
    description:
      "Используется когда EMAIL_FROM и RESEND_FROM пусты. По умолчанию onboarding@resend.dev — резервный адрес Resend для тестов.",
  },
  {
    group: "Email (Resend, legacy)",
    key: "RESEND_WEBHOOK_SECRET",
    label: "Webhook signing secret",
    description:
      "Resend dashboard → Webhooks → Reveal signing secret. Без неё POST /api/email/inbound в production возвращает 503 (HMAC verify не пройдёт). Формат: whsec_… (base64).",
    secret: true,
  },
  {
    group: "Email (Resend, legacy)",
    key: "INBOUND_EMAIL",
    label: "Адрес входящей почты",
    description:
      "Email-адрес на verified-домене, на который Resend будет отправлять webhooks для входящих писем. По умолчанию sales@geleoteka.ru. Остальные адреса (billing@, other@) игнорируются.",
  },

  // ── Email (Timeweb IMAP sync) ────────────────────────────────────────
  // NON-SECRET ONLY. Mailbox passwords live exclusively in env
  // (TIMEWEB_IMAP_PASSWORD / TIMEWEB_IMAP_PASSWORD_<SLUG>) and MUST NOT be
  // added here — this table is plaintext and rendered in the admin UI.
  {
    group: "Email (Timeweb IMAP)",
    key: "MAIL_SYNC_ENABLED",
    label: "Синхронизация почты включена",
    description:
      "true/false. Главный рубильник mail-sync воркера. Пока false, воркер простаивает и ничего не читает по IMAP. Пароли ящиков задаются ТОЛЬКО в env, не здесь.",
  },
  {
    group: "Email (Timeweb IMAP)",
    key: "TIMEWEB_IMAP_HOST",
    label: "IMAP host",
    description: "По умолчанию imap.timeweb.ru. Только IMAPS (TLS), порт 993.",
  },
  {
    group: "Email (Timeweb IMAP)",
    key: "TIMEWEB_IMAP_PORT",
    label: "IMAP порт",
    description: "По умолчанию 993 (IMAPS/TLS). Открытый 143 запрещён.",
  },
  {
    group: "Email (Timeweb IMAP)",
    key: "MAIL_SYNC_SOURCES",
    label: "Источники синхронизации (JSON)",
    description:
      'JSON-массив источников: [{"mailbox":"sales@geleoteka.ru","folder":"INBOX","role":"INBOUND"},{"mailbox":"crm-archive@geleoteka.ru","folder":"INBOX","role":"OUTBOUND_ARCHIVE"}]. role: INBOUND (прямой опрос ящика) или OUTBOUND_ARCHIVE (архив «Контроля исходящих»). Имена папок английские (INBOX, Sent).',
  },

  // ── SMS (smsc.ru) ────────────────────────────────────────────────────
  {
    group: "SMS (smsc.ru)",
    key: "SMSC_LOGIN",
    label: "Логин smsc.ru",
    description: "Логин аккаунта на smsc.ru. Используется для booking-confirmation SMS.",
  },
  {
    group: "SMS (smsc.ru)",
    key: "SMSC_PASSWORD",
    label: "Пароль smsc.ru",
    description: "Пароль или API-ключ из кабинета smsc.ru.",
    secret: true,
  },

  // ── Object storage (Yandex Cloud S3) ─────────────────────────────────
  {
    group: "Object storage (Yandex Cloud)",
    key: "YANDEX_ACCESS_KEY",
    label: "Access key ID",
    description: "Yandex Cloud Service Account → S3-совместимый ключ. Для загрузки фото авто и запчастей.",
    secret: true,
  },
  {
    group: "Object storage (Yandex Cloud)",
    key: "YANDEX_SECRET_KEY",
    label: "Secret access key",
    description: "Парный секретный ключ от Yandex Cloud Service Account.",
    secret: true,
  },
  {
    group: "Object storage (Yandex Cloud)",
    key: "YANDEX_BUCKET",
    label: "Имя bucket",
    description: "Имя bucket в Yandex Object Storage (напр. geleoteka-uploads).",
  },
  {
    group: "Object storage (Yandex Cloud)",
    key: "YANDEX_ENDPOINT",
    label: "S3 endpoint",
    description: "По умолчанию https://storage.yandexcloud.net. Менять только при переезде на другой провайдер.",
  },

  // ── Вход через соцсети (149-ФЗ: российские ИС) ───────────────────────
  // Кнопки на /login появляются автоматически, как только задан client_id
  // соответствующего провайдера. Redirect URI при регистрации приложения:
  //   Яндекс: https://geleoteka.ru/api/auth/oauth/yandex/callback
  //   VK ID:  https://geleoteka.ru/api/auth/oauth/vk/callback
  {
    group: "Вход через Яндекс и VK",
    key: "YANDEX_OAUTH_CLIENT_ID",
    label: "Яндекс — ClientID",
    description:
      "oauth.yandex.ru → создать приложение → Веб-сервисы. Redirect URI: https://geleoteka.ru/api/auth/oauth/yandex/callback. Доступы: email, имя, номер телефона.",
  },
  {
    group: "Вход через Яндекс и VK",
    key: "YANDEX_OAUTH_CLIENT_SECRET",
    label: "Яндекс — Client secret",
    description: "Секрет из того же приложения на oauth.yandex.ru.",
    secret: true,
  },
  {
    group: "Вход через Яндекс и VK",
    key: "VKID_CLIENT_ID",
    label: "VK ID — ID приложения",
    description:
      "id.vk.ru → бизнес-кабинет → создать приложение (Web). Redirect URI: https://geleoteka.ru/api/auth/oauth/vk/callback. Доступы: email, phone.",
  },
  {
    group: "Вход через Яндекс и VK",
    key: "VKID_CLIENT_SECRET",
    label: "VK ID — Защищённый ключ",
    description: "Сейчас не используется (обмен кода идёт по PKCE), поле на будущее.",
    secret: true,
  },

  // ── Расписание ───────────────────────────────────────────────────────
  {
    group: "Расписание",
    key: "SCHEDULE_CAPACITY",
    label: "Одновременных записей",
    description:
      "Сколько машин сервис принимает в одно время. По умолчанию 1: запись занимает слот целиком, и наложение по времени не допускается. Больше 1 имеет смысл, когда постов несколько — но какая машина на каком посту, система пока не различает.",
  },
];

/**
 * Сколько машин сервис принимает одновременно.
 *
 * Отдельная функция, а не getSetting в месте вызова: значение приходит строкой
 * из таблицы, и каждый потребитель иначе разбирал бы её по-своему. Мусор и
 * ноль трактуются как 1 — расписание, где ёмкость нулевая, не отказывает
 * честно, а молча перестаёт принимать записи.
 */
export async function getScheduleCapacity(): Promise<number> {
  const raw = await getSetting("SCHEDULE_CAPACITY");
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export async function getSetting(key: string): Promise<string | null> {
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: string | null = null;
  try {
    const row = (await db.setting.findUnique({
      where: { key },
      select: { value: true },
    })) as { value: string } | null;
    if (row && row.value) value = row.value;
  } catch (err) {
    // Setting table missing or query failed — fall through to env.
    console.error("[settings] getSetting failed", err);
  }

  if (!value) {
    const descriptor = KNOWN_SETTINGS.find((s) => s.key === key);
    const envName = descriptor?.envFallback ?? key;
    const envValue = process.env[envName];
    if (envValue && envValue.trim()) value = envValue;
  }

  CACHE.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export function invalidateSetting(key: string): void {
  CACHE.delete(key);
}
