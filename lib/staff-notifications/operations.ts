import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

export interface StaffNotificationOperationsDb {
  staffNotificationEvent: {
    deleteMany(args: QueryArgs): Promise<{ count: number }>;
  };
  staffNotificationDelivery: {
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
}

export interface RetainStaffNotificationEventsOptions {
  retentionDays: number;
  now?: Date;
}

/** Delete only event roots; receipt and delivery rows follow their CASCADE FK. */
export async function retainStaffNotificationEvents(
  client: Pick<StaffNotificationOperationsDb, "staffNotificationEvent">,
  options: RetainStaffNotificationEventsOptions,
): Promise<{ deletedEvents: number; cutoff: Date }> {
  const retentionDays = options.retentionDays;
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error("retentionDays must be an integer between 1 and 3650");
  }
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await client.staffNotificationEvent.deleteMany({
    where: {
      tenantKey: TENANT_KEY,
      createdAt: { lt: cutoff },
    },
  });
  return { deletedEvents: result.count, cutoff };
}

/** Requeue the same delivery row. No event producer is called on this path. */
export async function requeueDeadStaffNotificationDelivery(
  client: Pick<StaffNotificationOperationsDb, "staffNotificationDelivery">,
  deliveryId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (deliveryId.trim().length === 0) return false;
  const result = await client.staffNotificationDelivery.updateMany({
    where: {
      tenantKey: TENANT_KEY,
      id: deliveryId,
      status: "DEAD",
    },
    data: {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      leaseOwner: null,
      leaseUntil: null,
      providerMessageId: null,
      lastErrorCode: null,
      sentAt: null,
    },
  });
  return result.count === 1;
}

export async function cancelActiveStaffNotificationDeliveries(
  client: Pick<StaffNotificationOperationsDb, "staffNotificationDelivery">,
  errorCode = "CHANNEL_DISABLED",
): Promise<number> {
  const result = await client.staffNotificationDelivery.updateMany({
    where: {
      tenantKey: TENANT_KEY,
      channel: "TELEGRAM",
      status: { in: ["PENDING", "PROCESSING", "RETRY"] },
    },
    data: {
      status: "CANCELLED",
      leaseOwner: null,
      leaseUntil: null,
      lastErrorCode: errorCode,
    },
  });
  return result.count;
}

/** Cancel rows from an earlier channel epoch before any worker can lease them. */
export async function cancelStaffNotificationDeliveriesBefore(
  client: Pick<StaffNotificationOperationsDb, "staffNotificationDelivery">,
  enabledAt: Date,
): Promise<number> {
  const result = await client.staffNotificationDelivery.updateMany({
    where: {
      tenantKey: TENANT_KEY,
      channel: "TELEGRAM",
      status: { in: ["PENDING", "PROCESSING", "RETRY"] },
      event: { occurredAt: { lt: enabledAt } },
    },
    data: {
      status: "CANCELLED",
      leaseOwner: null,
      leaseUntil: null,
      lastErrorCode: "EVENT_BEFORE_CHANNEL_CUTOVER",
    },
  });
  return result.count;
}
