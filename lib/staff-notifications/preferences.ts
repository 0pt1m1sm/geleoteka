import type { Permission } from "@/lib/permissions";
import {
  STAFF_NOTIFICATION_EVENT_CATALOG,
  type StaffNotificationType,
} from "@/lib/staff-notifications/types";

/** Categories the employee may actually receive before personal opt-outs. */
export function staffNotificationTypesForPermissions(
  permissions: ReadonlySet<string>,
): StaffNotificationType[] {
  if (!permissions.has("notifications.view" satisfies Permission)) return [];

  return (Object.entries(STAFF_NOTIFICATION_EVENT_CATALOG) as Array<
    [StaffNotificationType, (typeof STAFF_NOTIFICATION_EVENT_CATALOG)[StaffNotificationType]]
  >)
    .filter(([, definition]) => permissions.has(definition.fallbackPermission))
    .map(([type]) => type);
}
