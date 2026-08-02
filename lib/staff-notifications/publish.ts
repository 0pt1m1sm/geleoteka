import { isInboundCommChannel } from "@/lib/crm/inbound-communications";
import {
  assertSafeAdminActionUrl,
  makeAdminActionUrl,
} from "@/lib/staff-notifications/safe-action-url";
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
import { formatDateTime } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";

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
  TASK_CREATED: {
    sourceType: "CrmTask",
    dedupePrefix: "task-created",
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

export interface PublishTaskAssignedInput {
  taskId: string;
  ownerUserId: string;
  assignedByUserId: string;
  assignmentAuditId: string;
  customerUserId: string | null;
  customerName: string | null;
  dealId: string | null;
  dueAt: Date;
  occurredAt: Date;
}

export interface PublishTaskCreatedInput {
  taskId: string;
  customerUserId: string | null;
  customerName: string | null;
  dealId: string | null;
  dealNumber: string | null;
  occurredAt: Date;
}

export interface PublishUserLoginInput {
  userId: string;
  userName: string;
  permissionRole: string;
  loginAuditId: string;
  occurredAt: Date;
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

/** A moved due date is a new overdue occurrence; a scanner replay is not. */
export function crmTaskOverdueDedupeKey(taskId: string, dueAt: Date): string {
  const id = requireNonBlank(taskId, "taskId");
  if (!(dueAt instanceof Date) || !Number.isFinite(dueAt.getTime())) {
    throw new Error("dueAt must be a valid Date");
  }
  return `task-overdue:${id}:${dueAt.toISOString()}`;
}

export function taskAssignedDedupeKey(
  taskId: string,
  ownerUserId: string,
  assignmentAuditId: string,
): string {
  return `task-assigned:${requireNonBlank(taskId, "taskId")}:${requireNonBlank(
    ownerUserId,
    "ownerUserId",
  )}:${requireNonBlank(assignmentAuditId, "assignmentAuditId")}`;
}

export function userLoginDedupeKey(
  userId: string,
  loginAuditId: string,
): string {
  return `user-login:${requireNonBlank(userId, "userId")}:${requireNonBlank(
    loginAuditId,
    "loginAuditId",
  )}`;
}

export async function publishUserLogin(
  client: StaffNotificationPublishTx,
  input: PublishUserLoginInput,
): Promise<StaffNotificationEventRecord> {
  const userId = requireNonBlank(input.userId, "userId");
  const userName = normalizeSafeCustomerName(input.userName) ?? "Пользователь";
  const role = roleLabel(requireNonBlank(input.permissionRole, "permissionRole"));
  return publishStaffNotificationEvent(client, {
    type: "USER_LOGIN",
    dedupeKey: userLoginDedupeKey(userId, input.loginAuditId),
    sourceType: "User",
    sourceId: userId,
    safeSummary: `Вход в платформу\n${userName} · ${role}`,
    actionPath: makeAdminActionUrl(
      `/admin/users/${encodeURIComponent(userId)}`,
    ),
    occurredAt: input.occurredAt,
  });
}

export async function publishTaskCreated(
  client: StaffNotificationPublishTx,
  input: PublishTaskCreatedInput,
): Promise<StaffNotificationEventRecord> {
  const taskId = requireNonBlank(input.taskId, "taskId");
  const customerName = normalizeSafeCustomerName(input.customerName);
  const dealNumber = normalizeSafeDealNumber(input.dealNumber);
  const context = [
    customerName,
    dealNumber ? `сделка ${dealNumber}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const actionPath = input.dealId
    ? `/admin/crm/deals/${encodeURIComponent(input.dealId)}`
    : input.customerUserId
      ? `/admin/customers/${encodeURIComponent(input.customerUserId)}`
      : "/admin/crm/tasks";

  return publishStaffNotificationEvent(client, {
    type: "TASK_CREATED",
    dedupeKey: staffNotificationEntityDedupeKey("TASK_CREATED", taskId),
    sourceType: "CrmTask",
    sourceId: taskId,
    relatedCustomerUserId: input.customerUserId,
    relatedDealId: input.dealId,
    relatedTaskId: taskId,
    safeSummary: context ? `Новая задача\n${context}` : "Новая задача",
    actionPath: makeAdminActionUrl(actionPath),
    occurredAt: input.occurredAt,
  });
}

/** Publish only assignments made by somebody other than the new owner. */
export async function publishTaskAssigned(
  client: StaffNotificationPublishTx,
  input: PublishTaskAssignedInput,
): Promise<StaffNotificationEventRecord | null> {
  const taskId = requireNonBlank(input.taskId, "taskId");
  const ownerUserId = requireNonBlank(input.ownerUserId, "ownerUserId");
  const assignedByUserId = requireNonBlank(
    input.assignedByUserId,
    "assignedByUserId",
  );
  if (ownerUserId === assignedByUserId) return null;
  if (!(input.dueAt instanceof Date) || !Number.isFinite(input.dueAt.getTime())) {
    throw new Error("dueAt must be a valid Date");
  }

  const customerName = normalizeSafeCustomerName(input.customerName);
  const safeSummary = [
    "Вам назначена задача",
    customerName,
    `Срок: ${formatDateTime(input.dueAt)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  const actionPath = input.dealId
    ? `/admin/crm/deals/${encodeURIComponent(input.dealId)}`
    : input.customerUserId
      ? `/admin/customers/${encodeURIComponent(input.customerUserId)}`
      : "/admin/crm/tasks";

  return publishStaffNotificationEvent(client, {
    type: "TASK_ASSIGNED",
    dedupeKey: taskAssignedDedupeKey(
      taskId,
      ownerUserId,
      input.assignmentAuditId,
    ),
    sourceType: "CrmTask",
    sourceId: taskId,
    relatedCustomerUserId: input.customerUserId,
    relatedDealId: input.dealId,
    relatedTaskId: taskId,
    targetUserId: ownerUserId,
    safeSummary,
    actionPath: makeAdminActionUrl(actionPath),
    occurredAt: input.occurredAt,
  });
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
  if (input.type === "CRM_TASK_OVERDUE") {
    if (input.sourceType !== "CrmTask") {
      throw new Error("CRM_TASK_OVERDUE must use CrmTask as its source");
    }
    if (input.relatedTaskId !== input.sourceId) {
      throw new Error("CRM_TASK_OVERDUE must reference its source task");
    }
    if (input.dedupeKey !== crmTaskOverdueDedupeKey(input.sourceId, input.occurredAt)) {
      throw new Error("CRM_TASK_OVERDUE dedupeKey must include CrmTask.id and dueAt");
    }
  }
  if (input.type === "TASK_ASSIGNED") {
    if (input.sourceType !== "CrmTask") {
      throw new Error("TASK_ASSIGNED must use CrmTask as its source");
    }
    if (input.relatedTaskId !== input.sourceId) {
      throw new Error("TASK_ASSIGNED must reference its source task");
    }
    if (!input.targetUserId) {
      throw new Error("TASK_ASSIGNED must target the task owner");
    }
    const prefix = `task-assigned:${input.sourceId}:${input.targetUserId}:`;
    if (
      !input.dedupeKey.startsWith(prefix) ||
      input.dedupeKey.slice(prefix.length).trim().length === 0
    ) {
      throw new Error(
        "TASK_ASSIGNED dedupeKey must include task, owner and assignment occurrence",
      );
    }
  }
  if (input.type === "TASK_CREATED" && input.relatedTaskId !== input.sourceId) {
    throw new Error("TASK_CREATED must reference its source task");
  }
  if (input.type === "USER_LOGIN") {
    if (input.sourceType !== "User") {
      throw new Error("USER_LOGIN must use User as its source");
    }
    const prefix = `user-login:${input.sourceId}:`;
    if (
      !input.dedupeKey.startsWith(prefix) ||
      input.dedupeKey.slice(prefix.length).trim().length === 0
    ) {
      throw new Error("USER_LOGIN dedupeKey must include user and login occurrence");
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

function normalizeSafeCustomerName(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 200) : null;
}

function normalizeSafeDealNumber(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return /^[A-Za-zА-Яа-яЁё0-9-]{1,40}$/.test(normalized) ? normalized : null;
}
