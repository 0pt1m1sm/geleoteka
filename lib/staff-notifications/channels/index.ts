import type {
  SafeChannelPayload,
  StaffNotificationChannel,
} from "@/lib/staff-notifications/types";
import { telegramChannelAdapter } from "@/lib/staff-notifications/channels/telegram";

export type ChannelDeliveryResult =
  | { outcome: "sent"; providerMessageId?: string | null }
  | { outcome: "retry"; errorCode: string; retryAfterMs?: number }
  | { outcome: "dead"; errorCode: string };

/**
 * destinationKey is routing data; SafeChannelPayload is the complete content
 * boundary. Adapters cannot receive arbitrary event metadata or CRM rows.
 */
export interface StaffNotificationChannelAdapter {
  send(
    destinationKey: string,
    payload: SafeChannelPayload,
  ): Promise<ChannelDeliveryResult>;
}

export type StaffNotificationChannelRegistry = Readonly<
  Partial<Record<StaffNotificationChannel, StaffNotificationChannelAdapter>>
>;

export const STAFF_NOTIFICATION_CHANNEL_REGISTRY: StaffNotificationChannelRegistry =
  Object.freeze({ TELEGRAM: telegramChannelAdapter });
