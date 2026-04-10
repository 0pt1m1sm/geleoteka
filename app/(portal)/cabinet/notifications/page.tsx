export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  BOOKING_CONFIRMATION: "Подтверждение записи",
  STATUS_CHANGE: "Смена статуса",
  REMINDER_1_DAY: "Напоминание",
  REMINDER_SAME_DAY: "Напоминание",
  ESTIMATE_READY: "Смета готова",
};

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const notifications = await db.notification.findMany({
    where: { userId: session.id },
    orderBy: { sentAt: "desc" },
    take: 50,
  });

  // Mark all as read
  await db.notification.updateMany({
    where: { userId: session.id, readAt: null },
    data: { readAt: new Date() },
  });

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">Уведомления</h1>

      {notifications.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Уведомлений пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n: Record<string, unknown>) => (
            <div
              key={n.id as string}
              className={`card flex items-start gap-4 py-3 ${
                !(n.readAt) ? "border-l-2 border-l-[var(--color-accent)]" : ""
              }`}
            >
              <div className="flex-1">
                <p className="text-xs text-[var(--color-accent)] font-medium mb-1">
                  {TYPE_LABELS[n.type as string] ?? (n.type as string)}
                </p>
                <p className="text-sm">{n.message as string}</p>
              </div>
              <p className="text-xs text-[var(--foreground-muted)] shrink-0">
                {formatDateTime(n.sentAt as Date)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
