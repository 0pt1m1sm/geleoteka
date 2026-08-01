import "server-only";

import { getSetting } from "@/lib/settings";
import {
  TELEGRAM_CORE_SETTING_KEYS,
  TELEGRAM_EVENT_SETTING_KEYS,
  normalizeStaffNotificationDispatchSecret,
  resolveTelegramRuntimeConfig,
  type TelegramRuntimeConfig,
} from "@/lib/staff-notifications/channels/telegram/config-values";

/**
 * Load the complete Telegram runtime switch. The master flag alone never
 * enables network traffic: every required value must also pass strict parsing.
 */
export async function loadTelegramRuntimeConfig(): Promise<TelegramRuntimeConfig> {
  const keys = [...TELEGRAM_CORE_SETTING_KEYS, ...TELEGRAM_EVENT_SETTING_KEYS];
  const values = await Promise.all(keys.map(async (key) => [key, await getSetting(key)] as const));
  return resolveTelegramRuntimeConfig(Object.fromEntries(values));
}

export async function loadStaffNotificationDispatchSecret(): Promise<string | null> {
  return normalizeStaffNotificationDispatchSecret(
    await getSetting("STAFF_NOTIFICATION_DISPATCH_SECRET"),
  );
}
