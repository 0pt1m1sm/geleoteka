"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { getSetting, invalidateSetting, KNOWN_SETTINGS } from "@/lib/settings";
import { parseBooleanSetting, SECRET_PLACEHOLDER } from "@/lib/settings-shared";
import { sendEmail, resolveEmailFrom } from "@/lib/email/send";
import { normalizeTransportName } from "@/lib/email/transport";
import { validateSettingValue } from "@/lib/settings-validation";
import { cancelActiveStaffNotificationDeliveries } from "@/lib/staff-notifications/operations";

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
  const session = await requirePermission("settings.manage");

  const knownByKey = new Map(KNOWN_SETTINGS.map((s) => [s.key, s]));
  const changes: Array<{ key: string; value: string | null }> = [];

  for (const [rawKey, rawValue] of formData.entries()) {
    const key = rawKey.trim();
    const descriptor = knownByKey.get(key);
    if (!descriptor) continue; // Silently ignore unknown / framework fields.
    const raw = (rawValue as FormDataEntryValue).toString();
    const value = raw.trim();
    const input = descriptor.input ?? (descriptor.secret ? "secret" : "text");

    // Skip untouched secret fields (input held the masked placeholder).
    if (input === "secret" && value === PLACEHOLDER) continue;

    if (value === "") {
      changes.push({ key, value: null });
      continue;
    }

    const validated = validateSettingValue(descriptor, value);
    if (!validated.ok) return { ok: false, error: validated.error };
    changes.push({ key, value: validated.value });
  }

  // Чекбоксы шлют пару записей на ключ (скрытое "false" + отмеченное "true");
  // действует последняя. Дедуп заодно даёт честный счётчик «Сохранено (N)».
  const lastByKey = new Map(changes.map((change) => [change.key, change]));
  changes.length = 0;
  changes.push(...lastByKey.values());

  const telegramEnabledChange = changes.find(
    (change) => change.key === "TELEGRAM_ENABLED",
  );
  const telegramEnabledAfter = telegramEnabledChange
    ? parseBooleanSetting(
        telegramEnabledChange.value ?? process.env.TELEGRAM_ENABLED ?? null,
      )
    : null;
  const telegramEnabledAt = new Date();

  await db.$transaction(async (tx) => {
    for (const change of changes) {
      if (change.value === null) {
        await tx.setting.deleteMany({ where: { key: change.key } });
      } else {
        await tx.setting.upsert({
          where: { key: change.key },
          create: { key: change.key, value: change.value, updatedByUserId: session.id },
          update: { value: change.value, updatedByUserId: session.id },
        });
      }
    }
    if (telegramEnabledAfter === true) {
      await tx.setting.upsert({
        where: { key: "TELEGRAM_ENABLED_AT" },
        create: {
          key: "TELEGRAM_ENABLED_AT",
          value: telegramEnabledAt.toISOString(),
          updatedByUserId: session.id,
        },
        // Saving another field in the same card must not move the cutover.
        update: {},
      });
    } else if (telegramEnabledAfter === false) {
      await tx.setting.deleteMany({ where: { key: "TELEGRAM_ENABLED_AT" } });
      await cancelActiveStaffNotificationDeliveries(tx, "CHANNEL_DISABLED");
    }
  });

  const savedKeys = changes.map((change) => change.key);
  for (const key of savedKeys) {
    invalidateSetting(key);
  }
  if (telegramEnabledAfter !== null) invalidateSetting("TELEGRAM_ENABLED_AT");

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
  const session = await requirePermission("settings.manage");

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
