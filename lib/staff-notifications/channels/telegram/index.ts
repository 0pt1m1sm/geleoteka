import { db } from "@/lib/db";
import { createTelegramChannelAdapter } from "@/lib/staff-notifications/channels/telegram/adapter";

export const telegramChannelAdapter = createTelegramChannelAdapter({
  db,
  fetch: globalThis.fetch,
  loadConfig: async () =>
    (await import("@/lib/staff-notifications/channels/telegram/config"))
      .loadTelegramRuntimeConfig(),
});

export { createTelegramChannelAdapter } from "@/lib/staff-notifications/channels/telegram/adapter";
