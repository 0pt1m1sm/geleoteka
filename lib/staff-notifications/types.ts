import type { InboundCommChannel } from "@/lib/crm/inbound-communications";
import type { Permission } from "@/lib/permissions";

export const STAFF_NOTIFICATION_PRIORITIES = ["P0", "P1", "P2"] as const;
export type StaffNotificationPriority = (typeof STAFF_NOTIFICATION_PRIORITIES)[number];

export interface StaffNotificationEventDefinition {
  label: string;
  priority: StaffNotificationPriority;
  fallbackPermission: Permission;
  requiresInboundChannel: boolean;
  /** Never fan out when an explicit recipient is unavailable or opted out. */
  targetOnly?: boolean;
}

/**
 * The closed event catalogue. Database values stay strings so adding a type is
 * one application deploy, not a PostgreSQL enum migration.
 */
export const STAFF_NOTIFICATION_EVENT_CATALOG = {
  INBOUND_CUSTOMER_MESSAGE: {
    label: "Клиент написал",
    priority: "P0",
    fallbackPermission: "crm.manage",
    requiresInboundChannel: true,
  },
  SERVICE_BOOKING_CREATED: {
    label: "Новая запись на сервис",
    priority: "P0",
    fallbackPermission: "service.manage",
    requiresInboundChannel: false,
  },
  ESTIMATE_CUSTOMER_APPROVED: {
    label: "Клиент согласовал смету",
    priority: "P0",
    fallbackPermission: "crm.manage",
    requiresInboundChannel: false,
  },
  ESTIMATE_CUSTOMER_DECLINED: {
    label: "Клиент отклонил смету",
    priority: "P0",
    fallbackPermission: "crm.manage",
    requiresInboundChannel: false,
  },
  PARTS_ORDER_CREATED: {
    label: "Заказ запчастей",
    priority: "P1",
    fallbackPermission: "parts.manage",
    requiresInboundChannel: false,
  },
  RENTAL_BOOKING_CREATED: {
    label: "Бронь аренды",
    priority: "P1",
    fallbackPermission: "rentals.manage",
    requiresInboundChannel: false,
  },
  INBOUND_MESSAGE_UNRESOLVED: {
    label: "Сообщение не разобрано",
    priority: "P1",
    fallbackPermission: "crm.manage",
    requiresInboundChannel: true,
  },
  CRM_TASK_OVERDUE: {
    label: "Просроченная задача",
    priority: "P1",
    fallbackPermission: "crm.manage",
    requiresInboundChannel: false,
  },
  TASK_ASSIGNED: {
    label: "Задача назначена",
    priority: "P1",
    fallbackPermission: "crm.manage",
    requiresInboundChannel: false,
    targetOnly: true,
  },
  USER_LOGIN: {
    label: "Вход в платформу",
    priority: "P2",
    fallbackPermission: "users.manage",
    requiresInboundChannel: false,
  },
  TASK_CREATED: {
    label: "Новая задача",
    priority: "P1",
    fallbackPermission: "crm.manage",
    requiresInboundChannel: false,
  },
  STAFF_DELIVERY_DEAD: {
    label: "Доставка не прошла",
    priority: "P2",
    fallbackPermission: "settings.manage",
    requiresInboundChannel: false,
  },
} as const satisfies Record<string, StaffNotificationEventDefinition>;

export type StaffNotificationType = keyof typeof STAFF_NOTIFICATION_EVENT_CATALOG;

const STAFF_NOTIFICATION_TYPE_SET = new Set<string>(
  Object.keys(STAFF_NOTIFICATION_EVENT_CATALOG),
);

export function isStaffNotificationType(value: unknown): value is StaffNotificationType {
  return typeof value === "string" && STAFF_NOTIFICATION_TYPE_SET.has(value);
}

/** Adapter channels are strings in PostgreSQL and closed here. */
export const STAFF_NOTIFICATION_CHANNELS = ["TELEGRAM"] as const;
export type StaffNotificationChannel = (typeof STAFF_NOTIFICATION_CHANNELS)[number];

const STAFF_NOTIFICATION_CHANNEL_SET = new Set<string>(STAFF_NOTIFICATION_CHANNELS);

export function isStaffNotificationChannel(value: unknown): value is StaffNotificationChannel {
  return typeof value === "string" && STAFF_NOTIFICATION_CHANNEL_SET.has(value);
}

export const STAFF_NOTIFICATION_ROUTING_STATUSES = [
  "PENDING",
  "PROCESSING",
  "RETRY",
  "ROUTED",
  "DEAD",
] as const;
export type StaffNotificationRoutingStatus =
  (typeof STAFF_NOTIFICATION_ROUTING_STATUSES)[number];

export const TELEGRAM_DESTINATION_KINDS = ["PERSONAL", "SHARED"] as const;
export type TelegramDestinationKind = (typeof TELEGRAM_DESTINATION_KINDS)[number];

export const TELEGRAM_DELIVERY_SCOPES = ["FALLBACK_ONLY", "ALL_EVENTS"] as const;
export type TelegramDeliveryScope = (typeof TELEGRAM_DELIVERY_SCOPES)[number];

export function isTelegramDeliveryScope(value: unknown): value is TelegramDeliveryScope {
  return (
    typeof value === "string" &&
    (TELEGRAM_DELIVERY_SCOPES as readonly string[]).includes(value)
  );
}

export const TELEGRAM_LINK_PURPOSES = ["PERSONAL", "SHARED"] as const;
export type TelegramLinkPurpose = (typeof TELEGRAM_LINK_PURPOSES)[number];

/**
 * The only event content a channel adapter may receive. In particular there is
 * no arbitrary metadata, message subject/body, contact detail or provider URL.
 */
export interface SafeChannelPayload {
  eventId: string;
  type: StaffNotificationType;
  priority: StaffNotificationPriority;
  safeSummary: string;
  occurredAt: Date;
  actionUrl: string;
}

export interface StaffNotificationEventRecord {
  id: string;
  tenantKey: string;
  type: string;
  priority: string;
  channel: string | null;
  dedupeKey: string;
  sourceType: string;
  sourceId: string;
  relatedCustomerUserId: string | null;
  relatedDealId: string | null;
  relatedTaskId: string | null;
  targetUserId: string | null;
  fallbackPermission: string | null;
  summary: string;
  actionPath: string;
  occurredAt: Date;
  createdAt: Date;
}

export interface PublishStaffNotificationInput {
  type: StaffNotificationType;
  /** Required for channel-aware inbound event types; forbidden otherwise. */
  channel?: InboundCommChannel | null;
  dedupeKey: string;
  sourceType: string;
  sourceId: string;
  relatedCustomerUserId?: string | null;
  relatedDealId?: string | null;
  relatedTaskId?: string | null;
  targetUserId?: string | null;
  safeSummary: string;
  actionPath: string;
  occurredAt: Date;
}
