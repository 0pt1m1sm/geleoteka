import type { StaffNotificationChannelRegistry } from "@/lib/staff-notifications/channels";
import { STAFF_NOTIFICATION_CHANNEL_REGISTRY } from "@/lib/staff-notifications/channels";
import { toSafeChannelPayload } from "@/lib/staff-notifications/publish";
import { isStaffNotificationChannel } from "@/lib/staff-notifications/types";
import type { StaffNotificationEventRecord } from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

interface StaffNotificationDispatcherTx {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  staffNotificationDelivery: {
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
}

export interface StaffNotificationDispatcherDb {
  $transaction<T>(fn: (tx: StaffNotificationDispatcherTx) => Promise<T>): Promise<T>;
  staffNotificationDelivery: {
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
}

export const STAFF_DELIVERY_MAX_ATTEMPTS = 10;
export const STAFF_DELIVERY_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
] as const;

export interface LeaseStaffDeliveriesOptions {
  workerId: string;
  now?: Date;
  leaseMs?: number;
  limit?: number;
  maxAttempts?: number;
}

export interface LeasedStaffDelivery {
  deliveryId: string;
  tenantKey: string;
  channel: string;
  destinationKey: string;
  attempts: number;
  leaseOwner: string;
  leaseUntil: Date;
  event: StaffNotificationEventRecord;
}

interface LeasedDeliveryRow {
  deliveryId: string;
  tenantKey: string;
  channel: string;
  destinationKey: string;
  attempts: number;
  leaseOwner: string;
  leaseUntil: Date;
  eventId: string;
  eventType: string;
  eventPriority: string;
  eventChannel: string | null;
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
  eventCreatedAt: Date;
}

/**
 * Atomically claim due work with FOR UPDATE SKIP LOCKED. The transaction ends
 * before this function returns; adapters therefore always perform HTTP outside
 * database locks.
 */
export async function leaseStaffNotificationDeliveries(
  client: StaffNotificationDispatcherDb,
  options: LeaseStaffDeliveriesOptions,
): Promise<LeasedStaffDelivery[]> {
  const workerId = requireNonBlank(options.workerId, "workerId");
  const now = options.now ?? new Date();
  const leaseMs = positiveInteger(options.leaseMs ?? 30_000, "leaseMs");
  const limit = Math.min(100, positiveInteger(options.limit ?? 25, "limit"));
  const maxAttempts = positiveInteger(
    options.maxAttempts ?? STAFF_DELIVERY_MAX_ATTEMPTS,
    "maxAttempts",
  );
  const leaseUntil = new Date(now.getTime() + leaseMs);

  return client.$transaction(async (tx) => {
    // A worker that died on its final claim must not leave PROCESSING forever.
    await tx.staffNotificationDelivery.updateMany({
      where: {
        tenantKey: TENANT_KEY,
        status: "PROCESSING",
        attempts: { gte: maxAttempts },
        leaseUntil: { lte: now },
      },
      data: {
        status: "DEAD",
        leaseOwner: null,
        leaseUntil: null,
        lastErrorCode: "LEASE_EXPIRED_MAX_ATTEMPTS",
      },
    });

    const rows = await tx.$queryRaw<LeasedDeliveryRow[]>`
      WITH candidates AS (
        SELECT d."id"
        FROM "StaffNotificationDelivery" d
        WHERE d."tenantKey" = ${TENANT_KEY}
          AND d."attempts" < ${maxAttempts}
          AND (
            (d."status" IN ('PENDING', 'RETRY') AND d."nextAttemptAt" <= ${now})
            OR
            (d."status" = 'PROCESSING' AND d."leaseUntil" <= ${now})
          )
        ORDER BY d."nextAttemptAt" ASC, d."id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      ), claimed AS (
        UPDATE "StaffNotificationDelivery" d
        SET "status" = 'PROCESSING',
            "attempts" = d."attempts" + 1,
            "leaseOwner" = ${workerId},
            "leaseUntil" = ${leaseUntil},
            "lastErrorCode" = NULL
        FROM candidates c
        WHERE d."id" = c."id"
        RETURNING d.*
      )
      SELECT
        c."id" AS "deliveryId",
        c."tenantKey",
        c."channel",
        c."destinationKey",
        c."attempts",
        c."leaseOwner",
        c."leaseUntil",
        e."id" AS "eventId",
        e."type" AS "eventType",
        e."priority" AS "eventPriority",
        e."channel" AS "eventChannel",
        e."dedupeKey",
        e."sourceType",
        e."sourceId",
        e."relatedCustomerUserId",
        e."relatedDealId",
        e."relatedTaskId",
        e."targetUserId",
        e."fallbackPermission",
        e."summary",
        e."actionPath",
        e."occurredAt",
        e."createdAt" AS "eventCreatedAt"
      FROM claimed c
      INNER JOIN "StaffNotificationEvent" e
        ON e."tenantKey" = c."tenantKey" AND e."id" = c."eventId"
      ORDER BY c."nextAttemptAt" ASC, c."id" ASC
    `;

    return rows.map(toLeasedDelivery);
  });
}

/** Dispatch one already-leased row and persist the lease-guarded outcome. */
export async function dispatchLeasedStaffNotification(
  client: StaffNotificationDispatcherDb,
  delivery: LeasedStaffDelivery,
  registry: StaffNotificationChannelRegistry = STAFF_NOTIFICATION_CHANNEL_REGISTRY,
  now: Date = new Date(),
): Promise<"sent" | "retry" | "dead" | "lease-lost"> {
  if (!isStaffNotificationChannel(delivery.channel)) {
    return recordStaffDeliveryFailure(client, delivery, {
      errorCode: "UNKNOWN_CHANNEL",
      permanent: true,
      now,
    });
  }

  const adapter = registry[delivery.channel];
  if (!adapter) {
    return recordStaffDeliveryFailure(client, delivery, {
      errorCode: "ADAPTER_UNAVAILABLE",
      now,
    });
  }

  let result;
  try {
    result = await adapter.send(
      delivery.destinationKey,
      toSafeChannelPayload(delivery.event),
    );
  } catch {
    // Do not persist or log raw adapter errors: provider responses can contain
    // destination identifiers or other sensitive transport detail.
    return recordStaffDeliveryFailure(client, delivery, {
      errorCode: "ADAPTER_EXCEPTION",
      now,
    });
  }
  if (result.outcome === "sent") {
    return recordStaffDeliverySent(
      client,
      delivery,
      result.providerMessageId ?? null,
      now,
    );
  }
  return recordStaffDeliveryFailure(client, delivery, {
    errorCode: result.errorCode,
    permanent: result.outcome === "dead",
    retryAfterMs: result.outcome === "retry" ? result.retryAfterMs : undefined,
    now,
  });
}

export async function recordStaffDeliverySent(
  client: StaffNotificationDispatcherDb,
  delivery: Pick<LeasedStaffDelivery, "deliveryId" | "tenantKey" | "leaseOwner">,
  providerMessageId: string | null,
  sentAt: Date = new Date(),
): Promise<"sent" | "lease-lost"> {
  const result = await client.staffNotificationDelivery.updateMany({
    where: leaseGuard(delivery),
    data: {
      status: "SENT",
      providerMessageId,
      lastErrorCode: null,
      sentAt,
      leaseOwner: null,
      leaseUntil: null,
    },
  });
  return result.count === 1 ? "sent" : "lease-lost";
}

export interface StaffDeliveryFailureInput {
  errorCode: string;
  permanent?: boolean;
  retryAfterMs?: number;
  now?: Date;
  maxAttempts?: number;
}

export async function recordStaffDeliveryFailure(
  client: StaffNotificationDispatcherDb,
  delivery: Pick<
    LeasedStaffDelivery,
    "deliveryId" | "tenantKey" | "leaseOwner" | "attempts"
  >,
  input: StaffDeliveryFailureInput,
): Promise<"retry" | "dead" | "lease-lost"> {
  const now = input.now ?? new Date();
  const maxAttempts = input.maxAttempts ?? STAFF_DELIVERY_MAX_ATTEMPTS;
  const permanent = input.permanent === true || delivery.attempts >= maxAttempts;
  const status = permanent ? "DEAD" : "RETRY";
  const nextAttemptAt = permanent
    ? now
    : staffDeliveryNextAttemptAt(delivery.attempts, now, input.retryAfterMs);

  const result = await client.staffNotificationDelivery.updateMany({
    where: leaseGuard(delivery),
    data: {
      status,
      nextAttemptAt,
      lastErrorCode: normalizeErrorCode(input.errorCode),
      leaseOwner: null,
      leaseUntil: null,
    },
  });
  if (result.count !== 1) return "lease-lost";
  return permanent ? "dead" : "retry";
}

export async function cancelStaffNotificationDelivery(
  client: StaffNotificationDispatcherDb,
  deliveryId: string,
): Promise<boolean> {
  const result = await client.staffNotificationDelivery.updateMany({
    where: {
      tenantKey: TENANT_KEY,
      id: deliveryId,
      status: { in: ["PENDING", "PROCESSING", "RETRY"] },
    },
    data: {
      status: "CANCELLED",
      leaseOwner: null,
      leaseUntil: null,
    },
  });
  return result.count === 1;
}

export function staffDeliveryNextAttemptAt(
  attempts: number,
  now: Date,
  retryAfterMs?: number,
): Date {
  const scheduleIndex = Math.max(
    0,
    Math.min(attempts - 1, STAFF_DELIVERY_RETRY_DELAYS_MS.length - 1),
  );
  const scheduled = STAFF_DELIVERY_RETRY_DELAYS_MS[scheduleIndex];
  const providerDelay =
    retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? retryAfterMs
      : 0;
  return new Date(now.getTime() + Math.max(scheduled, providerDelay));
}

function toLeasedDelivery(row: LeasedDeliveryRow): LeasedStaffDelivery {
  return {
    deliveryId: row.deliveryId,
    tenantKey: row.tenantKey,
    channel: row.channel,
    destinationKey: row.destinationKey,
    attempts: row.attempts,
    leaseOwner: row.leaseOwner,
    leaseUntil: row.leaseUntil,
    event: {
      id: row.eventId,
      tenantKey: row.tenantKey,
      type: row.eventType,
      priority: row.eventPriority,
      channel: row.eventChannel,
      dedupeKey: row.dedupeKey,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      relatedCustomerUserId: row.relatedCustomerUserId,
      relatedDealId: row.relatedDealId,
      relatedTaskId: row.relatedTaskId,
      targetUserId: row.targetUserId,
      fallbackPermission: row.fallbackPermission,
      summary: row.summary,
      actionPath: row.actionPath,
      occurredAt: row.occurredAt,
      createdAt: row.eventCreatedAt,
    },
  };
}

function leaseGuard(
  delivery: Pick<LeasedStaffDelivery, "deliveryId" | "tenantKey" | "leaseOwner">,
): QueryArgs {
  return {
    id: delivery.deliveryId,
    tenantKey: delivery.tenantKey,
    status: "PROCESSING",
    leaseOwner: delivery.leaseOwner,
  };
}

function normalizeErrorCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9_.:-]+/g, "_");
  return (normalized || "UNKNOWN_ERROR").slice(0, 80);
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireNonBlank(value: string, field: string): string {
  if (value.trim().length === 0) throw new Error(`${field} must not be blank`);
  return value;
}
