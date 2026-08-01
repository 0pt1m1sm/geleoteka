export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
} from "@/app/actions/staff-notifications";
import { Card, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import { inboundCommunicationCopy } from "@/lib/crm/inbound-communications";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/tenant";
import { formatDateTime } from "@/lib/utils";

interface ReceiptRow {
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

export default async function StaffNotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await roleHasPermission(session.permissionRole, "crm.manage"))) redirect("/");

  const receipts = (await db.staffNotificationReceipt.findMany({
    where: { tenantKey: TENANT_KEY, userId: session.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
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
  })) as ReceiptRow[];
  const unreadCount = receipts.reduce((count, receipt) => count + (receipt.readAt ? 0 : 1), 0);

  return (
    <div>
      <PageHeader
        eyebrow="CRM · Сигналы"
        title="Уведомления"
        description="Ваша персональная лента. Прочтение сигнала не закрывает задачу ответа."
        actions={
          unreadCount > 0 ? (
            <form action={markAllStaffNotificationsRead}>
              <button type="submit" className="btn btn-secondary text-sm">
                Прочитать все
              </button>
            </form>
          ) : undefined
        }
      />

      <Card>
        {receipts.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">Уведомлений пока нет.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {receipts.map((receipt) => {
              const copy = inboundCommunicationCopy(receipt.event.channel ?? "");
              return (
                <li
                  key={receipt.eventId}
                  className={`py-4 ${receipt.readAt ? "" : "border-l-2 border-[var(--color-accent)] pl-3"}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {!receipt.readAt ? (
                          <span className="badge bg-[var(--color-accent)] text-[var(--color-accent-foreground)]">
                            Новое
                          </span>
                        ) : null}
                        <span className="text-xs text-[var(--foreground-muted)]">
                          {formatDateTime(receipt.event.occurredAt)}
                        </span>
                      </div>
                      <p className="mt-2 font-medium">{receipt.event.summary}</p>
                      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                        Уведомление прочитано отдельно от задачи FOLLOW_UP.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link href={receipt.event.actionPath} className="btn btn-secondary text-sm">
                        {copy.openAction}
                      </Link>
                      {!receipt.readAt ? (
                        <form action={markStaffNotificationRead.bind(null, receipt.eventId)}>
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
