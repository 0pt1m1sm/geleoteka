import "server-only";

import { getSetting } from "@/lib/settings";
import { parseStaffNotificationRetentionDays } from "@/lib/staff-notifications/operations-config-values";

export async function loadStaffNotificationRetentionDays(): Promise<number | null> {
  return parseStaffNotificationRetentionDays(
    await getSetting("STAFF_NOTIFICATION_RETENTION_DAYS"),
  );
}
