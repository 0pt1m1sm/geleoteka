"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authz";
import { db } from "@/lib/db";
import { markStaffNotificationReceiptsRead } from "@/lib/staff-notifications/feed";

export async function markStaffNotificationRead(eventId: string): Promise<void> {
  const session = await requirePermission("crm.manage");
  await markStaffNotificationReceiptsRead(db, session.id, [eventId]);
  revalidatePath("/admin/notifications");
}

export async function markAllStaffNotificationsRead(): Promise<void> {
  const session = await requirePermission("crm.manage");
  await markStaffNotificationReceiptsRead(db, session.id, null);
  revalidatePath("/admin/notifications");
}
