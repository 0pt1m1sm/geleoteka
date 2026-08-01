import type { SettingDescriptor } from "@/lib/settings";
import {
  normalizeStaffNotificationDispatchSecret,
  normalizeTelegramBotToken,
  normalizeTelegramBotUsername,
  normalizeTelegramRoutingMode,
  normalizeTelegramWebhookSecret,
} from "@/lib/staff-notifications/channels/telegram/config-values";
import { parseStaffNotificationRetentionDays } from "@/lib/staff-notifications/operations-config-values";

export type SettingValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Validate and normalize every setting according to the server-owned descriptor. */
export function validateSettingValue(
  descriptor: SettingDescriptor,
  rawValue: string,
): SettingValidationResult {
  const value = rawValue.trim();
  const input = descriptor.input ?? (descriptor.secret ? "secret" : "text");

  if (input === "boolean") {
    return value === "true" || value === "false"
      ? { ok: true, value }
      : invalid(descriptor);
  }
  if (input === "select") {
    const allowed = descriptor.options?.some((option) => option.value === value) ?? false;
    return allowed ? { ok: true, value } : invalid(descriptor);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) return invalid(descriptor);
  if (value.length > (input === "secret" ? 4096 : 10_000)) return invalid(descriptor);

  if (descriptor.key === "TELEGRAM_BOT_TOKEN") {
    const normalized = normalizeTelegramBotToken(value);
    return normalized ? { ok: true, value: normalized } : invalid(descriptor);
  }
  if (descriptor.key === "TELEGRAM_BOT_USERNAME") {
    const normalized = normalizeTelegramBotUsername(value);
    return normalized ? { ok: true, value: normalized } : invalid(descriptor);
  }
  if (descriptor.key === "TELEGRAM_WEBHOOK_SECRET") {
    const normalized = normalizeTelegramWebhookSecret(value);
    return normalized ? { ok: true, value: normalized } : invalid(descriptor);
  }
  if (descriptor.key === "STAFF_NOTIFICATION_DISPATCH_SECRET") {
    const normalized = normalizeStaffNotificationDispatchSecret(value);
    return normalized ? { ok: true, value: normalized } : invalid(descriptor);
  }
  if (descriptor.key === "TELEGRAM_ROUTING_MODE") {
    const normalized = normalizeTelegramRoutingMode(value);
    return normalized ? { ok: true, value: normalized } : invalid(descriptor);
  }
  if (descriptor.key === "STAFF_NOTIFICATION_RETENTION_DAYS") {
    const days = parseStaffNotificationRetentionDays(value);
    return days === null
      ? invalid(descriptor)
      : { ok: true, value: String(days) };
  }

  return { ok: true, value };
}

function invalid(descriptor: SettingDescriptor): SettingValidationResult {
  return { ok: false, error: `${descriptor.label}: недопустимое значение` };
}
