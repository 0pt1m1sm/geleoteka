"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getSetting, invalidateSetting, KNOWN_SETTINGS } from "@/lib/settings";
import { SECRET_PLACEHOLDER } from "@/lib/settings-shared";
import { sendEmail, resolveEmailFrom } from "@/lib/email/send";
import { normalizeTransportName } from "@/lib/email/transport";

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
  /** Which transport the send actually went through. */
  transport?: "smtp" | "resend";
  /** Where the transport credential came from RIGHT NOW — "db" | "env" | "none". */
  credentialSource?: "db" | "env" | "none";
}

/**
 * Diagnostic: send a test email to the calling admin's own address through the
 * CONFIGURED transport (generic SMTP by default, Resend only when explicitly
 * selected). Surfaces whatever the transport returns — mock-mode notice, a
 * definite rejection (e.g. bad credentials / unverified domain), an ambiguous
 * timeout, or a success id — so the operator can verify the integration without
 * digging through container logs.
 *
 * Reports the active transport and the freshest credential source, and no
 * longer hard-codes "Resend": an SMTP send says SMTP.
 */
export async function sendTestEmail(): Promise<TestSendResult> {
  const session = await requireRole(["ADMIN"]);

  const to = session.email;
  if (!to) return { ok: false, detail: "У админа не задан email" };

  const transport = normalizeTransportName(await getSetting("EMAIL_TRANSPORT"));

  // Credential source, read freshly. The SMTP password lives ONLY in secret env
  // (never the Setting table), so its only sources are "env" or "none".
  let credentialSource: "db" | "env" | "none";
  if (transport === "resend") {
    const apiKeyRow = (await db.setting.findUnique({
      where: { key: "RESEND_API_KEY" },
      select: { value: true },
    })) as { value: string } | null;
    credentialSource = apiKeyRow?.value ? "db" : process.env.RESEND_API_KEY?.trim() ? "env" : "none";
  } else {
    credentialSource = process.env.SMTP_PASSWORD?.trim() ? "env" : "none";
  }

  // Invalidate cache so the send picks up whatever was just saved.
  for (const key of [
    "EMAIL_TRANSPORT",
    "EMAIL_FROM",
    "EMAIL_REPLY_TO",
    "RESEND_API_KEY",
    "RESEND_FROM",
    "RESEND_FROM_FALLBACK",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
  ]) {
    invalidateSetting(key);
  }

  const effectiveFrom = await resolveEmailFrom();
  const transportLabel = transport === "resend" ? "Resend" : "SMTP";

  const ts = new Date().toISOString();
  const result = await sendEmail({
    to,
    subject: `Geleoteka — тестовое письмо ${ts}`,
    html: `<p>Это диагностическое письмо из /admin/settings/integrations.</p><p>Если вы это видите — транспорт «${transportLabel}» настроен и письмо ушло.</p><p>Отправлено: ${ts}</p>`,
    text: `Тестовое письмо из /admin/settings/integrations.\nТранспорт: ${transportLabel}.\nОтправлено: ${ts}`,
  });

  if (result.success) {
    if (credentialSource === "none") {
      const missing = transport === "resend" ? "RESEND_API_KEY" : "SMTP_PASSWORD (secret env) / SMTP_USER";
      return {
        ok: false,
        detail: `Письмо прошло в mock-режиме (${missing} не задан). Реальное письмо НЕ отправлено. Транспорт: ${transportLabel}.`,
        from: effectiveFrom,
        to,
        transport,
        credentialSource,
      };
    }
    return {
      ok: true,
      detail: `Письмо отправлено через ${transportLabel}${result.id ? ` (id=${result.id})` : ""}. Проверьте почту ${to}.`,
      from: effectiveFrom,
      to,
      transport,
      credentialSource,
    };
  }

  return {
    ok: false,
    detail: `${transportLabel} не принял отправку: ${result.error}`,
    from: effectiveFrom,
    to,
    transport,
    credentialSource,
  };
}

