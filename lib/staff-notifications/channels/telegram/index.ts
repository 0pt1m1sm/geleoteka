import type {
  ChannelDeliveryResult,
  StaffNotificationChannelAdapter,
} from "@/lib/staff-notifications/channels";
import {
  createTelegramChannelAdapter,
  type TelegramAdapterDb,
} from "@/lib/staff-notifications/channels/telegram/adapter";
import type { SafeChannelPayload } from "@/lib/staff-notifications/types";
import { tenantDb } from "@/lib/tenant/scoped-db";

/**
 * Проводка настоящего адаптера.
 *
 * Клиент базы здесь не константа, а результат await: шов сужает клиент до
 * арендатора, и получить его на уровне модуля нельзя. Поэтому наружу отдаётся
 * тонкая обёртка, а настоящий адаптер собирается при первой отправке.
 * Договор `StaffNotificationChannelAdapter` при этом не меняется — ленивость
 * остаётся внутри проводки, где ей и место.
 */
async function realAdapter(): Promise<StaffNotificationChannelAdapter> {
  return createTelegramChannelAdapter({
    db: (await tenantDb()) as unknown as TelegramAdapterDb,
    fetch: globalThis.fetch,
    loadConfig: async () =>
      (await import("@/lib/staff-notifications/channels/telegram/config"))
        .loadTelegramRuntimeConfig(),
  });
}

export const telegramChannelAdapter: StaffNotificationChannelAdapter = {
  async send(destinationKey: string, payload: SafeChannelPayload): Promise<ChannelDeliveryResult> {
    return (await realAdapter()).send(destinationKey, payload);
  },
};

export { createTelegramChannelAdapter } from "@/lib/staff-notifications/channels/telegram/adapter";
