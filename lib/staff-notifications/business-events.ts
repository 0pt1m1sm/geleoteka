import type { InboundCommChannel } from "@/lib/crm/inbound-communications";
import {
  publishStaffNotificationEvent,
  staffNotificationEntityDedupeKey,
  type StaffNotificationPublishTx,
} from "@/lib/staff-notifications/publish";
import { makeAdminActionUrl } from "@/lib/staff-notifications/safe-action-url";
import type {
  StaffNotificationEventRecord,
  StaffNotificationType,
} from "@/lib/staff-notifications/types";

interface CustomerBusinessEventInput {
  sourceId: string;
  customerUserId: string;
  customerName: string;
  dealId: string;
  dealNumber: string | null;
  occurredAt: Date;
}

interface EstimateDecisionEventInput {
  sourceId: string;
  customerUserId: string | null;
  customerName: string | null;
  dealId: string;
  dealNumber: string | null;
  ownerUserId: string | null;
  occurredAt: Date;
}

export interface PublishInboundMessageUnresolvedInput {
  inboxMessageId: string;
  channel: InboundCommChannel;
  occurredAt: Date;
}

const EVENT_SOURCE = {
  SERVICE_BOOKING_CREATED: {
    sourceType: "Booking",
  },
  ESTIMATE_CUSTOMER_APPROVED: {
    sourceType: "Estimate",
  },
  ESTIMATE_CUSTOMER_DECLINED: {
    sourceType: "Estimate",
  },
  PARTS_ORDER_CREATED: {
    sourceType: "PartOrder",
  },
  PART_REQUEST_CREATED: {
    sourceType: "PartRequest",
  },
  RENTAL_BOOKING_CREATED: {
    sourceType: "RentalBooking",
  },
  INBOUND_MESSAGE_UNRESOLVED: {
    sourceType: "InboxMessage",
  },
} as const satisfies Partial<
  Record<StaffNotificationType, { sourceType: string }>
>;

export async function publishServiceBookingCreated(
  client: StaffNotificationPublishTx,
  input: CustomerBusinessEventInput,
): Promise<StaffNotificationEventRecord> {
  return publishCustomerBusinessEvent(client, "SERVICE_BOOKING_CREATED", input, {
    lead: "Новая запись на сервис",
    actionPath: `/admin/repair-orders/${encodeURIComponent(input.sourceId)}`,
  });
}

export async function publishPartsOrderCreated(
  client: StaffNotificationPublishTx,
  input: CustomerBusinessEventInput,
): Promise<StaffNotificationEventRecord> {
  return publishCustomerBusinessEvent(client, "PARTS_ORDER_CREATED", input, {
    lead: "Новый заказ запчастей",
    actionPath: `/admin/orders#order-${encodeURIComponent(input.sourceId)}`,
  });
}

export async function publishRentalBookingCreated(
  client: StaffNotificationPublishTx,
  input: CustomerBusinessEventInput,
): Promise<StaffNotificationEventRecord> {
  return publishCustomerBusinessEvent(client, "RENTAL_BOOKING_CREATED", input, {
    lead: "Новое бронирование аренды",
    actionPath: `/admin/rentals/bookings#booking-${encodeURIComponent(input.sourceId)}`,
  });
}

export async function publishEstimateCustomerApproved(
  client: StaffNotificationPublishTx,
  input: EstimateDecisionEventInput,
): Promise<StaffNotificationEventRecord> {
  return publishEstimateDecisionEvent(
    client,
    "ESTIMATE_CUSTOMER_APPROVED",
    input,
    "Клиент согласовал смету",
  );
}

export async function publishEstimateCustomerDeclined(
  client: StaffNotificationPublishTx,
  input: EstimateDecisionEventInput,
): Promise<StaffNotificationEventRecord> {
  // The rejection reason is intentionally absent from this boundary. It is
  // customer-authored free text and remains available only in CRM.
  return publishEstimateDecisionEvent(
    client,
    "ESTIMATE_CUSTOMER_DECLINED",
    input,
    "Клиент отклонил смету",
  );
}

export async function publishInboundMessageUnresolved(
  client: StaffNotificationPublishTx,
  input: PublishInboundMessageUnresolvedInput,
): Promise<StaffNotificationEventRecord> {
  const inboxMessageId = requireNonBlank(input.inboxMessageId, "inboxMessageId");
  const definition = EVENT_SOURCE.INBOUND_MESSAGE_UNRESOLVED;
  return publishStaffNotificationEvent(client, {
    type: "INBOUND_MESSAGE_UNRESOLVED",
    channel: input.channel,
    dedupeKey: staffNotificationEntityDedupeKey(
      "INBOUND_MESSAGE_UNRESOLVED",
      inboxMessageId,
    ),
    sourceType: definition.sourceType,
    sourceId: inboxMessageId,
    safeSummary: "Новое входящее сообщение требует разбора",
    actionPath: makeAdminActionUrl(
      `/admin/crm/inbox/${encodeURIComponent(inboxMessageId)}`,
    ),
    occurredAt: input.occurredAt,
  });
}

/**
 * Заявка «сообщить о поступлении».
 *
 * Уведомляется ПЕРСОНАЛ — без этого заявка лежала бы, пока кто-нибудь не
 * откроет список в админке. Покупателю автоуведомлений по-прежнему нет: это
 * решение владельца в PRD, и оно про появление остатка, а не про приём заявки.
 *
 * В тексте только номер детали: контакт — персональные данные, а сводка уходит
 * во внешние каналы (Telegram).
 */
export async function publishPartRequestCreated(
  client: StaffNotificationPublishTx,
  input: { requestId: string; oem: string; occurredAt: Date },
): Promise<StaffNotificationEventRecord> {
  const requestId = requireNonBlank(input.requestId, "requestId");
  const definition = EVENT_SOURCE.PART_REQUEST_CREATED;
  return publishStaffNotificationEvent(client, {
    type: "PART_REQUEST_CREATED",
    dedupeKey: staffNotificationEntityDedupeKey("PART_REQUEST_CREATED", requestId),
    sourceType: definition.sourceType,
    sourceId: requestId,
    safeSummary: `Заявка на деталь ${input.oem}`,
    actionPath: makeAdminActionUrl("/admin/parts/requests"),
    occurredAt: input.occurredAt,
  });
}

async function publishEstimateDecisionEvent(
  client: StaffNotificationPublishTx,
  type: "ESTIMATE_CUSTOMER_APPROVED" | "ESTIMATE_CUSTOMER_DECLINED",
  input: EstimateDecisionEventInput,
  lead: string,
): Promise<StaffNotificationEventRecord> {
  const sourceId = requireNonBlank(input.sourceId, "sourceId");
  const definition = EVENT_SOURCE[type];
  return publishStaffNotificationEvent(client, {
    type,
    dedupeKey: staffNotificationEntityDedupeKey(type, sourceId),
    sourceType: definition.sourceType,
    sourceId,
    relatedCustomerUserId: input.customerUserId,
    relatedDealId: requireNonBlank(input.dealId, "dealId"),
    targetUserId: input.ownerUserId,
    safeSummary: safeCustomerDealSummary(
      lead,
      input.customerName ?? "клиент",
      input.dealNumber,
    ),
    actionPath: makeAdminActionUrl(
      `/admin/crm/estimates/${encodeURIComponent(sourceId)}`,
    ),
    occurredAt: input.occurredAt,
  });
}

async function publishCustomerBusinessEvent(
  client: StaffNotificationPublishTx,
  type:
    | "SERVICE_BOOKING_CREATED"
    | "PARTS_ORDER_CREATED"
    | "RENTAL_BOOKING_CREATED",
  input: CustomerBusinessEventInput,
  copy: { lead: string; actionPath: string },
): Promise<StaffNotificationEventRecord> {
  const sourceId = requireNonBlank(input.sourceId, "sourceId");
  const definition = EVENT_SOURCE[type];
  return publishStaffNotificationEvent(client, {
    type,
    dedupeKey: staffNotificationEntityDedupeKey(type, sourceId),
    sourceType: definition.sourceType,
    sourceId,
    relatedCustomerUserId: requireNonBlank(
      input.customerUserId,
      "customerUserId",
    ),
    relatedDealId: requireNonBlank(input.dealId, "dealId"),
    safeSummary: safeCustomerDealSummary(
      copy.lead,
      input.customerName,
      input.dealNumber,
    ),
    actionPath: makeAdminActionUrl(copy.actionPath),
    occurredAt: input.occurredAt,
  });
}

function safeCustomerDealSummary(
  lead: string,
  customerName: string,
  dealNumber: string | null,
): string {
  const name = normalizeCustomerName(customerName);
  const normalizedDealNumber = normalizeDealNumber(dealNumber);
  return `${lead}\n${name}${normalizedDealNumber ? ` · сделка ${normalizedDealNumber}` : ""}`;
}

function normalizeCustomerName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return (normalized || "клиент").slice(0, 200);
}

function normalizeDealNumber(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return /^[A-Za-zА-Яа-яЁё0-9-]{1,40}$/.test(normalized) ? normalized : null;
}

function requireNonBlank(value: string, field: string): string {
  if (value.trim().length === 0) throw new Error(`${field} must not be blank`);
  return value;
}
