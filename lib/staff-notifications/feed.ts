import { TENANT_KEY } from "@/lib/tenant";

type QueryArgs = Record<string, unknown>;

export interface StaffNotificationFeedTx {
  staffNotificationReceipt: {
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
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
