import type {
  SafeChannelPayload,
  StaffNotificationChannel,
} from "@/lib/staff-notifications/types";

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

/** Story 2 intentionally ships no adapters. Telegram is registered in Story 4. */
export const STAFF_NOTIFICATION_CHANNEL_REGISTRY: StaffNotificationChannelRegistry =
  Object.freeze({});
