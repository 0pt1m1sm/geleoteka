import { isInboundCommChannel } from "@/lib/crm/inbound-communications";
import { assertSafeAdminActionUrl } from "@/lib/staff-notifications/safe-action-url";
import {
  STAFF_NOTIFICATION_EVENT_CATALOG,
  isStaffNotificationType,
  type PublishStaffNotificationInput,
  type SafeChannelPayload,
  type StaffNotificationEventRecord,
  type StaffNotificationPriority,
  type StaffNotificationType,
} from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

const ENTITY_EVENT_IDENTITY = {
  SERVICE_BOOKING_CREATED: {
    sourceType: "Booking",
    dedupePrefix: "service-booking-created",
  },
  ESTIMATE_CUSTOMER_APPROVED: {
    sourceType: "Estimate",
    dedupePrefix: "estimate-customer-approved",
  },
  ESTIMATE_CUSTOMER_DECLINED: {
    sourceType: "Estimate",
    dedupePrefix: "estimate-customer-declined",
  },
  PARTS_ORDER_CREATED: {
    sourceType: "PartOrder",
    dedupePrefix: "parts-order-created",
  },
  RENTAL_BOOKING_CREATED: {
    sourceType: "RentalBooking",
    dedupePrefix: "rental-booking-created",
  },
  INBOUND_MESSAGE_UNRESOLVED: {
    sourceType: "InboxMessage",
    dedupePrefix: "inbound-message-unresolved",
  },
} as const satisfies Partial<
  Record<StaffNotificationType, { sourceType: string; dedupePrefix: string }>
>;

/** The exact delegate available on an open Prisma transaction. */
export interface StaffNotificationPublishTx {
  staffNotificationEvent: {
    upsert(args: QueryArgs): Promise<unknown>;
  };
}

const EVENT_SELECT = {
  id: true,
  tenantKey: true,
  type: true,
  priority: true,
  channel: true,
  dedupeKey: true,
  sourceType: true,
  sourceId: true,
  relatedCustomerUserId: true,
  relatedDealId: true,
  relatedTaskId: true,
  targetUserId: true,
  fallbackPermission: true,
  summary: true,
  actionPath: true,
  occurredAt: true,
  createdAt: true,
} as const;

/**
 * Append a durable event to the transaction supplied by the producer.
 *
 * There is intentionally no singleton fallback: calling code must make the
 * event part of the same Prisma transaction as its business mutation. The
 * compound `(tenantKey, dedupeKey)` upsert makes replay idempotent without
 * mutating the first event.
 */
export async function publishStaffNotificationEvent(
  client: StaffNotificationPublishTx,
  input: PublishStaffNotificationInput,
): Promise<StaffNotificationEventRecord> {
  assertPublishInput(input);

  const definition = STAFF_NOTIFICATION_EVENT_CATALOG[input.type];
  const actionPath = assertSafeAdminActionUrl(input.actionPath);
  const channel = input.channel ?? null;

  const event = (await client.staffNotificationEvent.upsert({
    where: {
      tenantKey_dedupeKey: {
        tenantKey: TENANT_KEY,
        dedupeKey: input.dedupeKey,
      },
    },
    create: {
      tenantKey: TENANT_KEY,
      type: input.type,
      priority: definition.priority,
      channel,
      dedupeKey: input.dedupeKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      relatedCustomerUserId: input.relatedCustomerUserId ?? null,
      relatedDealId: input.relatedDealId ?? null,
      relatedTaskId: input.relatedTaskId ?? null,
      targetUserId: input.targetUserId ?? null,
      fallbackPermission: definition.fallbackPermission,
      summary: input.safeSummary,
      actionPath,
      occurredAt: input.occurredAt,
    },
    // Events are immutable. On replay return the original row unchanged.
    update: {},
    select: EVENT_SELECT,
  })) as StaffNotificationEventRecord;

  assertDedupeIdentity(event, input, definition.priority);
  return event;
}

/** The channel-neutral identity Story 3 producers must use. */
export function inboundCustomerMessageDedupeKey(communicationLogId: string): string {
  const id = requireNonBlank(communicationLogId, "communicationLogId");
  return `inbound-msg:${id}`;
}

export function staffNotificationEntityDedupeKey(
  type: keyof typeof ENTITY_EVENT_IDENTITY,
  sourceId: string,
): string {
  const id = requireNonBlank(sourceId, "sourceId");
  return `${ENTITY_EVENT_IDENTITY[type].dedupePrefix}:${id}`;
}

export function toSafeChannelPayload(
  event: StaffNotificationEventRecord,
): SafeChannelPayload {
  if (!isStaffNotificationType(event.type)) {
    throw new Error(`Unknown staff notification event type: ${event.type}`);
  }
  const definition = STAFF_NOTIFICATION_EVENT_CATALOG[event.type];
  if (event.priority !== definition.priority) {
    throw new Error(`Invalid priority for staff notification event ${event.id}`);
  }

  return {
    eventId: event.id,
    type: event.type,
    priority: definition.priority,
    safeSummary: event.summary,
    occurredAt: event.occurredAt,
    actionUrl: assertSafeAdminActionUrl(event.actionPath),
  };
}

function assertPublishInput(input: PublishStaffNotificationInput): void {
  if (!isStaffNotificationType(input.type)) {
    throw new Error(`Unknown staff notification event type: ${String(input.type)}`);
  }

  const definition = STAFF_NOTIFICATION_EVENT_CATALOG[input.type];
  if (definition.requiresInboundChannel) {
    if (!input.channel || !isInboundCommChannel(input.channel)) {
      throw new Error(`${input.type} requires a channel from the inbound CRM channel catalogue`);
    }
  } else if (input.channel != null) {
    throw new Error(`${input.type} does not accept an inbound communication channel`);
  }

  requireNonBlank(input.dedupeKey, "dedupeKey");
  requireNonBlank(input.sourceType, "sourceType");
  requireNonBlank(input.sourceId, "sourceId");
  if (input.type === "INBOUND_CUSTOMER_MESSAGE") {
    if (input.sourceType !== "CommunicationLog") {
      throw new Error("INBOUND_CUSTOMER_MESSAGE must use CommunicationLog as its source");
    }
    if (input.dedupeKey !== inboundCustomerMessageDedupeKey(input.sourceId)) {
      throw new Error("INBOUND_CUSTOMER_MESSAGE dedupeKey must be based on CommunicationLog.id");
    }
  }
  const entityIdentity = (
    ENTITY_EVENT_IDENTITY as Partial<
      Record<StaffNotificationType, { sourceType: string; dedupePrefix: string }>
    >
  )[input.type];
  if (entityIdentity) {
    if (input.sourceType !== entityIdentity.sourceType) {
      throw new Error(`${input.type} must use ${entityIdentity.sourceType} as its source`);
    }
    const expectedDedupeKey = `${entityIdentity.dedupePrefix}:${input.sourceId}`;
    if (input.dedupeKey !== expectedDedupeKey) {
      throw new Error(`${input.type} dedupeKey must be based on its source entity id`);
    }
  }
  requireNonBlank(input.safeSummary, "safeSummary");
  if (input.safeSummary.length > 500) {
    throw new Error("safeSummary must not exceed 500 characters");
  }
  if (!(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) {
    throw new Error("occurredAt must be a valid Date");
  }
}

function assertDedupeIdentity(
  event: StaffNotificationEventRecord,
  input: PublishStaffNotificationInput,
  priority: StaffNotificationPriority,
): void {
  const sameIdentity =
    event.tenantKey === TENANT_KEY &&
    event.dedupeKey === input.dedupeKey &&
    event.type === input.type &&
    event.priority === priority &&
    event.channel === (input.channel ?? null) &&
    event.sourceType === input.sourceType &&
    event.sourceId === input.sourceId;

  if (!sameIdentity) {
    throw new Error(`Staff notification dedupe key collision: ${input.dedupeKey}`);
  }
}

function requireNonBlank(value: string, field: string): string {
  if (value.trim().length === 0) throw new Error(`${field} must not be blank`);
  return value;
}
