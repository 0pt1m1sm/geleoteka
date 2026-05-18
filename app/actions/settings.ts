"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { invalidateSetting, KNOWN_SETTINGS } from "@/lib/settings";
import { SECRET_PLACEHOLDER } from "@/lib/settings-shared";
import { sendEmail } from "@/lib/email/send";

export interface UpsertSettingsResult {
  error: string | null;
  ok: boolean;
  savedKeys?: string[];
}

const PLACEHOLDER = SECRET_PLACEHOLDER;

/**
 * Bulk-upsert a group of settings — one Save button per integration card.
 *
 * Form payload is multi-key: each input's `name` is the setting key.
 * Special value handling:
 *   - empty string → drop the row (env-var fallback takes over)
 *   - placeholder string ("••••••") → no-op (user didn't touch this field;
 *     password inputs show a placeholder when a value is already set)
 *
 * Only keys listed in KNOWN_SETTINGS are accepted — prevents forged writes.
 */
export async function upsertSettings(
  _prev: UpsertSettingsResult | null,
  formData: FormData,
): Promise<UpsertSettingsResult> {
  const session = await requireRole(["ADMIN"]);

  const knownByKey = new Map(KNOWN_SETTINGS.map((s) => [s.key, s]));
  const savedKeys: string[] = [];

  for (const [rawKey, rawValue] of formData.entries()) {
    const key = rawKey.trim();
    if (!knownByKey.has(key)) continue; // Silently ignore unknown / framework fields.
    const raw = (rawValue as FormDataEntryValue).toString();
    const value = raw.trim();

    // Skip untouched secret fields (input held the masked placeholder).
    if (value === PLACEHOLDER) continue;

    if (value === "") {
      await db.setting.deleteMany({ where: { key } });
    } else {
      await db.setting.upsert({
        where: { key },
        create: { key, value, updatedByUserId: session.id },
        update: { value, updatedByUserId: session.id },
      });
    }
    invalidateSetting(key);
    savedKeys.push(key);
  }

  revalidatePath("/admin/settings/integrations");
  return { ok: true, error: null, savedKeys };
}

export interface TestSendResult {
  ok: boolean;
  detail: string;
  /** Effective from-address used (helps diagnose unverified-domain rejections). */
  from?: string;
  /** Effective recipient (admin's own email by default). */
  to?: string;
  /** Source the API key came from at this exact moment — "db" | "env" | "none". */
  apiKeySource?: "db" | "env" | "none";
}

/**
 * Diagnostic: send a test email to the calling admin's own address through
 * the full Resend transport. Surfaces whatever the transport returns —
 * mock-mode notice, Resend 4xx (e.g. unverified domain), or success id —
 * so the operator can verify the integration without digging through
 * Railway logs.
 *
 * Bypasses the getSetting cache by checking source freshly to give a
 * truthful "where did the API key come from RIGHT NOW" badge.
 */
export async function sendTestEmail(): Promise<TestSendResult> {
  const session = await requireRole(["ADMIN"]);

  const to = session.email;
  if (!to) return { ok: false, detail: "У админа не задан email" };

  // Fresh read to report accurate source (the getSetting cache may still
  // hold an older state; this query talks directly to the DB).
  const apiKeyRow = (await db.setting.findUnique({
    where: { key: "RESEND_API_KEY" },
    select: { value: true },
  })) as { value: string } | null;
  const apiKeySource: "db" | "env" | "none" = apiKeyRow?.value
    ? "db"
    : process.env.RESEND_API_KEY?.trim()
      ? "env"
      : "none";

  const fromVerifiedRow = (await db.setting.findUnique({
    where: { key: "RESEND_FROM" },
    select: { value: true },
  })) as { value: string } | null;
  const fromFallbackRow = (await db.setting.findUnique({
    where: { key: "RESEND_FROM_FALLBACK" },
    select: { value: true },
  })) as { value: string } | null;
  const effectiveFrom =
    fromVerifiedRow?.value?.trim() ||
    fromFallbackRow?.value?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    process.env.RESEND_FROM_FALLBACK?.trim() ||
    "onboarding@resend.dev";

  // Invalidate cache so the send picks up whatever was just saved.
  invalidateSetting("RESEND_API_KEY");
  invalidateSetting("RESEND_FROM");
  invalidateSetting("RESEND_FROM_FALLBACK");

  const ts = new Date().toISOString();
  const result = await sendEmail({
    to,
    subject: `Geleoteka — тестовое письмо ${ts}`,
    html: `<p>Это диагностическое письмо из /admin/settings/integrations.</p><p>Если вы это видите — Resend API key работает, верифицированный домен принимается, всё в порядке.</p><p>Отправлено: ${ts}</p>`,
    text: `Тестовое письмо из /admin/settings/integrations.\nЕсли получено — Resend настроен корректно.\nОтправлено: ${ts}`,
  });

  if (result.success) {
    if (apiKeySource === "none") {
      return {
        ok: false,
        detail:
          "Письмо прошло в mock-режиме (RESEND_API_KEY не задан ни в админке, ни в env). Реальное письмо НЕ отправлено.",
        from: effectiveFrom,
        to,
        apiKeySource,
      };
    }
    return {
      ok: true,
      detail: `Письмо отправлено через Resend (id=${result.id ?? "?"}). Проверьте почту ${to}.`,
      from: effectiveFrom,
      to,
      apiKeySource,
    };
  }

  return {
    ok: false,
    detail: `Resend отклонил отправку: ${result.error}`,
    from: effectiveFrom,
    to,
    apiKeySource,
  };
}

