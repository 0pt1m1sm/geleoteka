import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

export const STAFF_NOTIFICATION_FEED_SCOPES = ["mine", "all"] as const;
export type StaffNotificationFeedScope =
  (typeof STAFF_NOTIFICATION_FEED_SCOPES)[number];

export interface StaffNotificationFeedItem {
  eventId: string;
  type: string;
  channel: string | null;
  summary: string;
  actionPath: string;
  occurredAt: Date;
  createdAt: Date;
  hasPersonalReceipt: boolean;
  readAt: Date | null;
}

interface PersonalReceiptRow {
  eventId: string;
  readAt: Date | null;
  createdAt: Date;
  event: {
    type: string;
    channel: string | null;
    summary: string;
    actionPath: string;
    occurredAt: Date;
  };
}

interface AllEventsRow {
  id: string;
  type: string;
  channel: string | null;
  summary: string;
  actionPath: string;
  occurredAt: Date;
  createdAt: Date;
  receipts: Array<{ readAt: Date | null }>;
}

export interface StaffNotificationFeedTx {
  staffNotificationReceipt: {
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
}

export interface StaffNotificationFeedReader {
  staffNotificationReceipt: {
    findMany(args: QueryArgs): Promise<unknown>;
    count(args: QueryArgs): Promise<number>;
  };
  staffNotificationEvent: {
    findMany(args: QueryArgs): Promise<unknown>;
  };
}

export function isStaffNotificationFeedScope(
  value: unknown,
): value is StaffNotificationFeedScope {
  return value === "mine" || value === "all";
}

/**
 * Loads the selected feed while keeping the unread count personal in either
 * scope. The manage check lives at this data seam as well as in the page, so a
 * future caller cannot turn `scope=all` into an authorization bypass.
 */
export async function loadStaffNotificationFeedPage(
  client: StaffNotificationFeedReader,
  input: {
    userId: string;
    scope: StaffNotificationFeedScope;
    canManage: boolean;
    limit?: number;
  },
): Promise<{ items: StaffNotificationFeedItem[]; unreadCount: number }> {
  if (input.scope === "all" && !input.canManage) {
    throw new Error("notifications.manage is required for the all-events feed");
  }
  const limit = Math.max(1, Math.min(input.limit ?? 100, 100));
  const itemsPromise =
    input.scope === "all"
      ? loadAllEvents(client, input.userId, limit)
      : loadPersonalEvents(client, input.userId, limit);
  const [items, unreadCount] = await Promise.all([
    itemsPromise,
    client.staffNotificationReceipt.count({
      where: {
        tenantKey: TENANT_KEY,
        userId: input.userId,
        readAt: null,
      },
    }),
  ]);

  return { items, unreadCount };
}

/** Mutates only the current employee's receipt rows, never CRM obligations. */
export async function markStaffNotificationReceiptsRead(
  client: StaffNotificationFeedTx,
  userId: string,
  eventIds: readonly string[] | null,
  readAt: Date = new Date(),
): Promise<number> {
  const uniqueIds = eventIds ? [...new Set(eventIds.filter(Boolean))] : null;
  if (uniqueIds && uniqueIds.length === 0) return 0;
  const result = await client.staffNotificationReceipt.updateMany({
    where: {
      tenantKey: TENANT_KEY,
      userId,
      readAt: null,
      ...(uniqueIds ? { eventId: { in: uniqueIds } } : {}),
    },
    data: { readAt },
  });
  return result.count;
}

async function loadPersonalEvents(
  client: StaffNotificationFeedReader,
  userId: string,
  limit: number,
): Promise<StaffNotificationFeedItem[]> {
  const rows = (await client.staffNotificationReceipt.findMany({
    where: { tenantKey: TENANT_KEY, userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      eventId: true,
      readAt: true,
      createdAt: true,
      event: {
        select: {
          type: true,
          channel: true,
          summary: true,
          actionPath: true,
          occurredAt: true,
        },
      },
    },
  })) as PersonalReceiptRow[];

  return rows.map((row) => ({
    eventId: row.eventId,
    type: row.event.type,
    channel: row.event.channel,
    summary: row.event.summary,
    actionPath: row.event.actionPath,
    occurredAt: row.event.occurredAt,
    createdAt: row.createdAt,
    hasPersonalReceipt: true,
    readAt: row.readAt,
  }));
}

async function loadAllEvents(
  client: StaffNotificationFeedReader,
  userId: string,
  limit: number,
): Promise<StaffNotificationFeedItem[]> {
  const rows = (await client.staffNotificationEvent.findMany({
    where: { tenantKey: TENANT_KEY },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      type: true,
      channel: true,
      summary: true,
      actionPath: true,
      occurredAt: true,
      createdAt: true,
      receipts: {
        where: { tenantKey: TENANT_KEY, userId },
        take: 1,
        select: { readAt: true },
      },
    },
  })) as AllEventsRow[];

  return rows.map((row) => ({
    eventId: row.id,
    type: row.type,
    channel: row.channel,
    summary: row.summary,
    actionPath: row.actionPath,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    hasPersonalReceipt: row.receipts.length > 0,
    readAt: row.receipts[0]?.readAt ?? null,
  }));
}
