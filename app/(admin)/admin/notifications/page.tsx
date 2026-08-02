export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
} from "@/app/actions/staff-notifications";
import { NotificationScopeSwitcher } from "@/components/admin/notifications/NotificationScopeSwitcher";
import { Card, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import { inboundCommunicationCopy } from "@/lib/crm/inbound-communications";
import { db } from "@/lib/db";
import {
  isStaffNotificationFeedScope,
  loadStaffNotificationFeedPage,
  type StaffNotificationFeedReader,
} from "@/lib/staff-notifications/feed";
import { formatDateTime } from "@/lib/utils";

export default async function StaffNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await roleHasPermission(session.permissionRole, "notifications.view"))) redirect("/");
  const canManage = await roleHasPermission(
    session.permissionRole,
    "notifications.manage",
  );
  const requestedScope = (await searchParams).scope;
  const scope = isStaffNotificationFeedScope(requestedScope) ? requestedScope : "mine";
  if (scope === "all" && !canManage) redirect("/admin/notifications");

  const { items, unreadCount } = await loadStaffNotificationFeedPage(
    db as unknown as StaffNotificationFeedReader,
    {
    userId: session.id,
    scope,
    canManage,
    },
  );

  return (
    <div>
      <PageHeader
        eyebrow="CRM · Сигналы"
        title="Уведомления"
        description={
          scope === "all"
            ? "Все события системы. Непрочитанное и отметки прочтения остаются вашими личными."
            : "Ваша персональная лента. Прочтение сигнала не закрывает задачу ответа."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/profile#staff-notifications" className="btn btn-secondary text-sm">
              Настройки уведомлений
            </Link>
            {canManage ? (
              <Link
                href="/admin/notifications/operations"
                className="btn btn-secondary text-sm"
              >
                Эксплуатация
              </Link>
            ) : null}
            {unreadCount > 0 ? (
              <form action={markAllStaffNotificationsRead}>
                <button type="submit" className="btn btn-secondary text-sm">
                  Прочитать все
                </button>
              </form>
            ) : null}
          </div>
        }
      />

      {canManage ? (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-[var(--foreground-muted)]">Лента:</span>
          <NotificationScopeSwitcher scope={scope} />
        </div>
      ) : null}

      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">Уведомлений пока нет.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.map((item) => {
              const copy = inboundCommunicationCopy(item.channel ?? "");
              const isPersonalUnread = item.hasPersonalReceipt && item.readAt === null;
              return (
                <li
                  key={item.eventId}
                  className={`py-4 ${isPersonalUnread ? "border-l-2 border-[var(--color-accent)] pl-3" : ""}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {isPersonalUnread ? (
                          <span className="badge bg-[var(--color-accent)] text-[var(--color-accent-foreground)]">
                            Новое
                          </span>
                        ) : null}
                        <span className="text-xs text-[var(--foreground-muted)]">
                          {formatDateTime(item.occurredAt)}
                        </span>
                      </div>
                      <p className="mt-2 font-medium">{item.summary}</p>
                      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                        Уведомление прочитано отдельно от задачи FOLLOW_UP.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link href={item.actionPath} className="btn btn-secondary text-sm">
                        {copy.openAction}
                      </Link>
                      {isPersonalUnread ? (
                        <form action={markStaffNotificationRead.bind(null, item.eventId)}>
                          <button type="submit" className="btn btn-ghost text-sm">
                            Прочитано
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
