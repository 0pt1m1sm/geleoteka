import { isInboundCommChannel } from "@/lib/crm/inbound-communications";
import {
  upsertInboundFollowUpTask,
  type InboundFollowUpTx,
} from "@/lib/crm/inbound-follow-up";
import { PERMISSIONS, resolveRolePermissions } from "@/lib/permissions";
import {
  TELEGRAM_CORE_SETTING_KEYS,
  TELEGRAM_EVENT_SETTING_KEYS,
  resolveTelegramRuntimeConfig,
} from "@/lib/staff-notifications/channels/telegram/config-values";
import {
  routeStaffNotificationEvent,
  selectStaffNotificationRecipients,
  type StaffNotificationRouterTx,
} from "@/lib/staff-notifications/router";
import {
  isStaffNotificationType,
  type StaffNotificationEventRecord,
  type StaffNotificationType,
} from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

interface ProjectorTx extends InboundFollowUpTx, StaffNotificationRouterTx {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  staffNotificationEvent: StaffNotificationRouterTx["staffNotificationEvent"] & {
    update(args: QueryArgs): Promise<unknown>;
  };
  communicationLog: InboundFollowUpTx["communicationLog"];
  user: {
    findMany(args: QueryArgs): Promise<unknown>;
    findUnique(args: QueryArgs): Promise<unknown>;
  };
  deal: {
    findUnique(args: QueryArgs): Promise<unknown>;
  };
  rolePermission: {
    findMany(args: QueryArgs): Promise<unknown>;
  };
  telegramDestination: {
    findMany(args: QueryArgs): Promise<unknown>;
  };
  setting: {
    findMany(args: QueryArgs): Promise<unknown>;
  };
}

export interface InboundCustomerMessageProjectorDb {
  $transaction<T>(fn: (tx: ProjectorTx) => Promise<T>): Promise<T>;
  staffNotificationEvent: {
    findMany(args: QueryArgs): Promise<unknown>;
  };
}

export type StaffNotificationProjectorDb = InboundCustomerMessageProjectorDb;

export const STAFF_NOTIFICATION_ROUTING_MAX_ATTEMPTS = 5;
export const STAFF_NOTIFICATION_ROUTING_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
] as const;

type ProjectionFailureCode =
  | "INVALID_EVENT"
  | "SOURCE_MISSING"
  | "SOURCE_MISMATCH"
  | "CUSTOMER_MISSING"
  | "TRANSIENT_FAILURE";

class InboundProjectionError extends Error {
  constructor(
    readonly failureCode: ProjectionFailureCode,
    readonly permanent: boolean,
    message: string,
  ) {
    super(message);
    this.name = "InboundProjectionError";
  }
}

interface CommunicationSource {
  id: string;
  customerUserId: string;
  dealId: string | null;
  channel: string;
  createdAt: Date;
}

interface StaffUserRow {
  id: string;
  permissionRole: string;
}

interface RolePermissionRow {
  role: string;
  permission: string;
  allowed: boolean;
}

interface DestinationRow {
  id: string;
  kind: string;
  userId: string | null;
  deliveryScope: string;
}

const ROUTABLE_EVENT_SOURCE_TYPES = {
  SERVICE_BOOKING_CREATED: "Booking",
  ESTIMATE_CUSTOMER_APPROVED: "Estimate",
  ESTIMATE_CUSTOMER_DECLINED: "Estimate",
  PARTS_ORDER_CREATED: "PartOrder",
  RENTAL_BOOKING_CREATED: "RentalBooking",
  INBOUND_MESSAGE_UNRESOLVED: "InboxMessage",
  CRM_TASK_OVERDUE: "CrmTask",
} as const satisfies Partial<Record<StaffNotificationType, string>>;

const ROUTABLE_EVENT_TYPES = Object.keys(
  ROUTABLE_EVENT_SOURCE_TYPES,
) as StaffNotificationType[];

export async function projectStaffNotificationEvent(
  client: StaffNotificationProjectorDb,
  eventId: string,
  now: Date = new Date(),
  dueOnly = false,
): Promise<"projected" | "already-routed"> {
  try {
    return await client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<StaffNotificationEventRecord[]>`
        SELECT
          "id", "tenantKey", "type", "priority", "channel", "dedupeKey",
          "sourceType", "sourceId", "relatedCustomerUserId", "relatedDealId",
          "relatedTaskId", "targetUserId", "fallbackPermission", "summary",
          "actionPath", "occurredAt", "createdAt"
        FROM "StaffNotificationEvent"
        WHERE "tenantKey" = ${TENANT_KEY}
          AND "id" = ${eventId}
          AND "routingStatus" IN ('PENDING', 'RETRY')
          AND (${dueOnly} = FALSE OR "nextRoutingAt" <= ${now})
        FOR UPDATE
      `;
      const event = rows[0];
      if (!event) return "already-routed";

      await projectLockedStaffNotification(tx, event);
      return "projected";
    });
  } catch (error) {
    // The projector transaction has rolled back. Persist retry/dead-letter state
    // separately so receipt or task failures cannot roll the attempt counter back.
    try {
      await recordProjectionFailure(client, eventId, classifyProjectionFailure(error), now);
    } catch {
      // Keep the original projection error visible to a direct caller. A later
      // durable pass can retry if failure accounting itself lost the database.
    }
    throw error;
  }
}

export async function projectInboundCustomerMessageEvent(
  client: InboundCustomerMessageProjectorDb,
  eventId: string,
  now: Date = new Date(),
  dueOnly = false,
): Promise<"projected" | "already-routed"> {
  return projectStaffNotificationEvent(client, eventId, now, dueOnly);
}

/** Route every durable Story 3/5 event that is due, oldest first. */
export async function projectPendingStaffNotificationEvents(
  client: StaffNotificationProjectorDb,
  limit = 25,
  now: Date = new Date(),
): Promise<number> {
  const events = (await client.staffNotificationEvent.findMany({
    where: {
      tenantKey: TENANT_KEY,
      type: { in: ["INBOUND_CUSTOMER_MESSAGE", ...ROUTABLE_EVENT_TYPES] },
      routingStatus: { in: ["PENDING", "RETRY"] },
      nextRoutingAt: { lte: now },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(limit, 100)),
    select: { id: true },
  })) as Array<{ id: string }>;

  let projected = 0;
  for (const event of events) {
    try {
      if ((await projectStaffNotificationEvent(client, event.id, now, true)) === "projected") {
        projected += 1;
      }
    } catch {
      // One old event must never reject unrelated durable work in the batch.
    }
  }
  return projected;
}

/** Process older durable work as well as the event that triggered this pass. */
export async function projectPendingInboundCustomerMessages(
  client: InboundCustomerMessageProjectorDb,
  limit = 25,
  now: Date = new Date(),
): Promise<number> {
  const events = (await client.staffNotificationEvent.findMany({
    where: {
      tenantKey: TENANT_KEY,
      type: "INBOUND_CUSTOMER_MESSAGE",
      routingStatus: { in: ["PENDING", "RETRY"] },
      nextRoutingAt: { lte: now },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(limit, 100)),
    select: { id: true },
  })) as Array<{ id: string }>;

  let projected = 0;
  for (const event of events) {
    try {
      if ((await projectInboundCustomerMessageEvent(client, event.id, now, true)) === "projected") {
        projected += 1;
      }
    } catch {
      // This is background recovery of older durable work. The direct projector
      // for a newly published event still throws above, but one old event must
      // never reject unrelated fresh mail.
    }
  }
  return projected;
}

export async function projectLockedInboundCustomerMessage(
  tx: ProjectorTx,
  event: StaffNotificationEventRecord,
): Promise<void> {
  if (
    event.tenantKey !== TENANT_KEY ||
    event.type !== "INBOUND_CUSTOMER_MESSAGE" ||
    event.sourceType !== "CommunicationLog" ||
    !event.relatedCustomerUserId ||
    !event.channel ||
    !isInboundCommChannel(event.channel)
  ) {
    throw new InboundProjectionError(
      "INVALID_EVENT",
      true,
      `Invalid inbound customer message event: ${event.id}`,
    );
  }

  const source = (await tx.communicationLog.findUnique({
    where: { id: event.sourceId },
    select: {
      id: true,
      customerUserId: true,
      dealId: true,
      channel: true,
      createdAt: true,
    },
  })) as CommunicationSource | null;
  if (!source) {
    throw new InboundProjectionError(
      "SOURCE_MISSING",
      true,
      `Inbound event source missing: ${event.id}`,
    );
  }
  if (
    source.customerUserId !== event.relatedCustomerUserId ||
    source.dealId !== event.relatedDealId ||
    source.channel !== event.channel
  ) {
    throw new InboundProjectionError(
      "SOURCE_MISMATCH",
      true,
      `Inbound event source mismatch: ${event.id}`,
    );
  }

  const [customer, deal] = await Promise.all([
    tx.user.findUnique({
      where: { id: source.customerUserId },
      select: { id: true, name: true },
    }) as Promise<{ id: string; name: string } | null>,
    source.dealId
      ? (tx.deal.findUnique({
          where: { id: source.dealId },
          select: { id: true, ownerUserId: true },
        }) as Promise<{ id: string; ownerUserId: string | null } | null>)
      : Promise.resolve(null),
  ]);
  if (!customer) {
    throw new InboundProjectionError(
      "CUSTOMER_MISSING",
      true,
      `Inbound event customer missing: ${event.id}`,
    );
  }

  // Serialize every projector touching the same open-task identity. This keeps
  // two different inbound events from racing the task's last-message anchor.
  const pairKey = `${TENANT_KEY}\u0000${source.customerUserId}\u0000${source.dealId ?? ""}`;
  await tx.$queryRaw<Array<{ locked: unknown }>>`
    SELECT pg_advisory_xact_lock(hashtextextended(${pairKey}, 0)) AS "locked"
  `;

  const task = await upsertInboundFollowUpTask(tx, {
    communicationLogId: source.id,
    communicationCreatedAt: source.createdAt,
    customerUserId: source.customerUserId,
    customerName: customer.name,
    dealId: source.dealId,
    ownerUserId: deal?.ownerUserId ?? null,
    channel: event.channel,
    messageOccurredAt: event.occurredAt,
    eventCreatedAt: event.createdAt,
  });

  const candidates = await loadRecipientCandidates(tx);
  const projectedEvent: StaffNotificationEventRecord = {
    ...event,
    relatedTaskId: task.taskId,
    targetUserId: task.ownerUserId,
  };

  await tx.staffNotificationEvent.update({
    where: { tenantKey_id: { tenantKey: TENANT_KEY, id: event.id } },
    data: {
      relatedTaskId: task.taskId,
      targetUserId: task.ownerUserId,
    },
  });
  await routeProjectedStaffNotification(tx, projectedEvent, candidates);
}

export async function projectLockedStaffNotification(
  tx: ProjectorTx,
  event: StaffNotificationEventRecord,
): Promise<void> {
  if (event.type === "INBOUND_CUSTOMER_MESSAGE") {
    await projectLockedInboundCustomerMessage(tx, event);
    return;
  }
  if (!isStaffNotificationType(event.type)) {
    throw new InboundProjectionError(
      "INVALID_EVENT",
      true,
      `Unknown staff notification event: ${event.id}`,
    );
  }
  const expectedSourceType = (
    ROUTABLE_EVENT_SOURCE_TYPES as Partial<Record<StaffNotificationType, string>>
  )[event.type];
  const inboundUnresolved = event.type === "INBOUND_MESSAGE_UNRESOLVED";
  if (
    event.tenantKey !== TENANT_KEY ||
    !expectedSourceType ||
    event.sourceType !== expectedSourceType ||
    !event.sourceId ||
    (inboundUnresolved &&
      (!event.channel || !isInboundCommChannel(event.channel))) ||
    (!inboundUnresolved && event.channel !== null)
  ) {
    throw new InboundProjectionError(
      "INVALID_EVENT",
      true,
      `Invalid staff notification event: ${event.id}`,
    );
  }

  const candidates = await loadRecipientCandidates(tx);
  await routeProjectedStaffNotification(tx, event, candidates);
}

async function routeProjectedStaffNotification(
  tx: ProjectorTx,
  event: StaffNotificationEventRecord,
  candidates: Awaited<ReturnType<typeof loadRecipientCandidates>>,
): Promise<void> {
  if (!isStaffNotificationType(event.type)) {
    throw new InboundProjectionError(
      "INVALID_EVENT",
      true,
      `Unknown staff notification event: ${event.id}`,
    );
  }
  const eventType = event.type;
  const selectedRecipients = selectStaffNotificationRecipients(event, candidates);
  const usesPersonalTarget =
    event.targetUserId !== null &&
    selectedRecipients.length === 1 &&
    selectedRecipients[0] === event.targetUserId;
  const telegramConfig = await loadTelegramRoutingConfig(tx);
  const destinations =
    telegramConfig.enabled &&
    event.occurredAt >= telegramConfig.enabledAt &&
    telegramConfig.enabledEventTypes.has(eventType)
      ? await loadDestinations(
          tx,
          usesPersonalTarget,
          usesPersonalTarget ? selectedRecipients[0] : null,
          telegramConfig.routingMode,
        )
      : [];

  await routeStaffNotificationEvent(tx, {
    event,
    candidates,
    destinations,
  });
}

interface ProjectionFailure {
  code: ProjectionFailureCode;
  permanent: boolean;
}

function classifyProjectionFailure(error: unknown): ProjectionFailure {
  if (error instanceof InboundProjectionError) {
    return { code: error.failureCode, permanent: error.permanent };
  }
  return { code: "TRANSIENT_FAILURE", permanent: false };
}

async function recordProjectionFailure(
  client: InboundCustomerMessageProjectorDb,
  eventId: string,
  failure: ProjectionFailure,
  now: Date,
): Promise<void> {
  await client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ routingAttempts: number }>>`
      SELECT "routingAttempts"
      FROM "StaffNotificationEvent"
      WHERE "tenantKey" = ${TENANT_KEY}
        AND "id" = ${eventId}
        AND "routingStatus" IN ('PENDING', 'RETRY')
      FOR UPDATE
    `;
    const event = rows[0];
    if (!event) return;

    const attempts = event.routingAttempts + 1;
    const dead = failure.permanent || attempts >= STAFF_NOTIFICATION_ROUTING_MAX_ATTEMPTS;
    await tx.staffNotificationEvent.update({
      where: { tenantKey_id: { tenantKey: TENANT_KEY, id: eventId } },
      data: {
        routingStatus: dead ? "DEAD" : "RETRY",
        routingAttempts: { increment: 1 },
        nextRoutingAt: dead ? now : nextRoutingAttemptAt(attempts, now),
        lastRoutingError: failure.code,
      },
    });
  });
}

function nextRoutingAttemptAt(attempts: number, now: Date): Date {
  const index = Math.max(
    0,
    Math.min(attempts - 1, STAFF_NOTIFICATION_ROUTING_RETRY_DELAYS_MS.length - 1),
  );
  return new Date(now.getTime() + STAFF_NOTIFICATION_ROUTING_RETRY_DELAYS_MS[index]);
}

async function loadRecipientCandidates(tx: ProjectorTx) {
  const users = (await tx.user.findMany({
    where: {
      deletedAt: null,
      permissionRole: { notIn: ["CLIENT", "NONE"] },
    },
    select: { id: true, permissionRole: true },
  })) as StaffUserRow[];
  const roles = [...new Set(users.map((user) => user.permissionRole).filter((r) => r !== "ADMIN"))];
  const stored = roles.length
    ? ((await tx.rolePermission.findMany({
        where: { tenantKey: TENANT_KEY, role: { in: roles } },
        select: { role: true, permission: true, allowed: true },
      })) as RolePermissionRow[])
    : [];
  const rowsByRole = new Map<string, RolePermissionRow[]>();
  for (const row of stored) {
    const rows = rowsByRole.get(row.role) ?? [];
    rows.push(row);
    rowsByRole.set(row.role, rows);
  }

  return users.map((user) => {
    const rows = rowsByRole.get(user.permissionRole) ?? [];
    const permissions =
      user.permissionRole === "ADMIN"
        ? new Set<string>(PERMISSIONS)
        : resolveRolePermissions(user.permissionRole, rows);
    return {
      userId: user.id,
      canViewNotifications: permissions.has("notifications.view"),
      permissions,
    };
  });
}

async function loadDestinations(
  tx: ProjectorTx,
  personalTarget: boolean,
  targetUserId: string | null,
  routingMode: "PERSONAL_ONLY" | "PERSONAL_WITH_SHARED_FALLBACK",
) {
  const rows = (await tx.telegramDestination.findMany({
    where: {
      tenantKey: TENANT_KEY,
      isActive: true,
      disabledAt: null,
    },
    select: { id: true, kind: true, userId: true, deliveryScope: true },
  })) as DestinationRow[];
  return rows
    .filter((row) => {
      if (row.kind === "SHARED" && row.deliveryScope === "ALL_EVENTS") {
        return true;
      }
      if (personalTarget) {
        return row.kind === "PERSONAL" && row.userId === targetUserId;
      }
      return (
        routingMode === "PERSONAL_WITH_SHARED_FALLBACK" && row.kind === "SHARED"
      );
    })
    .map((row) => ({
      recipientUserId: row.kind === "PERSONAL" ? row.userId : null,
      channel: "TELEGRAM" as const,
      destinationKey: row.id,
    }));
}

async function loadTelegramRoutingConfig(tx: ProjectorTx) {
  const keys = [...TELEGRAM_CORE_SETTING_KEYS, ...TELEGRAM_EVENT_SETTING_KEYS];
  const rows = (await tx.setting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  })) as Array<{ key: string; value: string }>;
  const values: Record<string, string | null> = Object.fromEntries(
    rows.map((row) => [row.key, row.value]),
  );
  for (const key of keys) {
    if (values[key] === undefined) values[key] = process.env[key] ?? null;
  }
  return resolveTelegramRuntimeConfig(values);
}
