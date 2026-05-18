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
  // ── Email (Resend) ───────────────────────────────────────────────────
  {
    group: "Email (Resend)",
    key: "RESEND_API_KEY",
    label: "Resend API key",
    description:
      "Resend dashboard → API Keys. Без неё все исходящие письма работают в mock-режиме (логируются, не отправляются).",
    secret: true,
  },
  {
    group: "Email (Resend)",
    key: "RESEND_FROM",
    label: "Отправитель (verified domain)",
    description:
      "Формат: «Geleoteka <info@geleoteka.ru>». Используется только когда домен geleoteka.ru верифицирован в Resend (SPF + DKIM зелёные). До этого — заполнено только RESEND_FROM_FALLBACK.",
  },
  {
    group: "Email (Resend)",
    key: "RESEND_FROM_FALLBACK",
    label: "Отправитель (fallback)",
    description:
      "Используется когда RESEND_FROM пустой. По умолчанию onboarding@resend.dev — резервный адрес Resend для тестов.",
  },
  {
    group: "Email (Resend)",
    key: "RESEND_WEBHOOK_SECRET",
    label: "Webhook signing secret",
    description:
      "Resend dashboard → Webhooks → Reveal signing secret. Без неё POST /api/email/inbound в production возвращает 503 (HMAC verify не пройдёт). Формат: whsec_… (base64).",
    secret: true,
  },
  {
    group: "Email (Resend)",
    key: "INBOUND_EMAIL",
    label: "Адрес входящей почты",
    description:
      "Email-адрес на verified-домене, на который Resend будет отправлять webhooks для входящих писем. По умолчанию info@geleoteka.ru. Остальные адреса (sales@, billing@) игнорируются.",
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
];

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
