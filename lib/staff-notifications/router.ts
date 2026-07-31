import { isStaffNotificationChannel } from "@/lib/staff-notifications/types";
import type {
  StaffNotificationChannel,
  StaffNotificationEventRecord,
} from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

export interface StaffNotificationRouterTx {
  staffNotificationReceipt: {
    createMany(args: QueryArgs): Promise<{ count: number }>;
  };
  staffNotificationDelivery: {
    createMany(args: QueryArgs): Promise<{ count: number }>;
  };
  staffNotificationEvent: {
    update(args: QueryArgs): Promise<unknown>;
  };
}

/** A caller-resolved staff member and the permissions effective for their role. */
export interface StaffRecipientCandidate {
  userId: string;
  canViewNotifications: boolean;
  permissions: ReadonlySet<string>;
}

/**
 * A destination already verified by its adapter. recipientUserId is null for a
 * shared fallback destination. Raw Telegram chat_id never crosses this seam.
 */
export interface StaffDeliveryDestination {
  recipientUserId: string | null;
  channel: StaffNotificationChannel;
  destinationKey: string;
}

export interface RouteStaffNotificationInput {
  event: StaffNotificationEventRecord;
  candidates: readonly StaffRecipientCandidate[];
  destinations?: readonly StaffDeliveryDestination[];
  routedAt?: Date;
}

export interface RouteStaffNotificationResult {
  recipientUserIds: string[];
  receiptsCreated: number;
  deliveriesCreated: number;
  outcome: "routed" | "no-recipients";
}

/**
 * Select the explicit owner when eligible; otherwise fan out to the eligible
 * fallback team. Every recipient must have both notification visibility and
 * the event's domain permission. Candidate lookup stays outside this pure
 * function so Story 4 can layer stored role overrides without coupling the
 * core to a page/API authorization helper.
 */
export function selectStaffNotificationRecipients(
  event: Pick<StaffNotificationEventRecord, "targetUserId" | "fallbackPermission">,
  candidates: readonly StaffRecipientCandidate[],
): string[] {
  const permission = event.fallbackPermission;
  const eligible = candidates.filter(
    (candidate) =>
      candidate.canViewNotifications &&
      (permission === null || candidate.permissions.has(permission)),
  );

  if (event.targetUserId) {
    const target = eligible.find((candidate) => candidate.userId === event.targetUserId);
    if (target) return [target.userId];
  }

  if (!permission) return [];
  return [...new Set(eligible.map((candidate) => candidate.userId))];
}

/**
 * Persist receipts and delivery rows in the supplied Prisma transaction.
 * createMany(skipDuplicates) makes projector replay harmless. A valid event
 * with no recipients is considered routed with zero rows: later enabling a
 * channel must not backfill historical events.
 */
export async function routeStaffNotificationEvent(
  client: StaffNotificationRouterTx,
  input: RouteStaffNotificationInput,
): Promise<RouteStaffNotificationResult> {
  if (input.event.tenantKey !== TENANT_KEY) {
    throw new Error("Cannot route a staff notification event from another tenant");
  }

  const recipientUserIds = selectStaffNotificationRecipients(
    input.event,
    input.candidates,
  );
  const recipientSet = new Set(recipientUserIds);
  const routedAt = input.routedAt ?? new Date();

  let receiptsCreated = 0;
  if (recipientUserIds.length > 0) {
    const result = await client.staffNotificationReceipt.createMany({
      data: recipientUserIds.map((userId) => ({
        tenantKey: TENANT_KEY,
        eventId: input.event.id,
        userId,
      })),
      skipDuplicates: true,
    });
    receiptsCreated = result.count;
  }

  const deliveryRows = uniqueDestinations(
    recipientUserIds.length === 0
      ? []
      : (input.destinations ?? []).filter(
          (destination) =>
            destination.recipientUserId === null ||
            recipientSet.has(destination.recipientUserId),
        ),
  ).map((destination) => ({
    tenantKey: TENANT_KEY,
    eventId: input.event.id,
    channel: destination.channel,
    destinationKey: destination.destinationKey,
  }));

  let deliveriesCreated = 0;
  if (deliveryRows.length > 0) {
    const result = await client.staffNotificationDelivery.createMany({
      data: deliveryRows,
      skipDuplicates: true,
    });
    deliveriesCreated = result.count;
  }

  await client.staffNotificationEvent.update({
    where: { tenantKey_id: { tenantKey: TENANT_KEY, id: input.event.id } },
    data: {
      routingStatus: "ROUTED",
      routingAttempts: { increment: 1 },
      nextRoutingAt: routedAt,
      routedAt,
      lastRoutingError: null,
    },
  });

  return {
    recipientUserIds,
    receiptsCreated,
    deliveriesCreated,
    outcome: recipientUserIds.length === 0 ? "no-recipients" : "routed",
  };
}

function uniqueDestinations(
  destinations: readonly StaffDeliveryDestination[],
): StaffDeliveryDestination[] {
  const unique = new Map<string, StaffDeliveryDestination>();
  for (const destination of destinations) {
    if (!isStaffNotificationChannel(destination.channel)) {
      throw new Error(`Unknown staff notification channel: ${String(destination.channel)}`);
    }
    if (destination.destinationKey.trim().length === 0) {
      throw new Error("Staff notification destinationKey must not be blank");
    }
    unique.set(`${destination.channel}\u0000${destination.destinationKey}`, destination);
  }
  return [...unique.values()];
}
