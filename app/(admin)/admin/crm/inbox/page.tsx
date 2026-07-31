export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { InboxRowActions } from "@/components/admin/inbox/InboxRowActions";

interface Props {
  searchParams: Promise<{ status?: string }>;
}

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "PENDING", label: "Pending" },
  { key: "ARCHIVED", label: "Архив" },
  { key: "SPAM", label: "Спам" },
  { key: "DELETED", label: "Удалённые" },
];

interface InboxRow {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  receivedAt: Date;
  attachments: unknown;
  direction: string;
  emailMessage: { createdAt: Date } | null;
}

function attachmentCount(attachments: unknown): number {
  return Array.isArray(attachments) ? attachments.length : 0;
}

/** Message that landed noticeably before the sync picked it up — i.e. imported
 *  from backlog after downtime. A >10 min gap between the mail's own timestamp
 *  and the row's sync time is the signal. */
const BACKLOG_GAP_MS = 10 * 60 * 1000;
function isBacklog(receivedAt: Date, syncedAt: Date | null | undefined): boolean {
  if (!syncedAt) return false;
  return new Date(syncedAt).getTime() - new Date(receivedAt).getTime() > BACKLOG_GAP_MS;
}

export default async function InboxPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const sp = await searchParams;
  const status = STATUS_TABS.find((t) => t.key === (sp.status ?? "PENDING"))?.key ?? "PENDING";

  const [rows, counts] = (await Promise.all([
    db.inboxMessage.findMany({
      where: { status: status as never },
      orderBy: { receivedAt: "desc" },
      take: 50,
      select: {
        id: true,
        fromEmail: true,
        fromName: true,
        subject: true,
        receivedAt: true,
        attachments: true,
        direction: true,
        emailMessage: { select: { createdAt: true } },
      },
    }),
    db.inboxMessage.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ])) as [InboxRow[], Array<{ status: string; _count: { _all: number } }>];

  const countByStatus = new Map<string, number>(
    counts.map((c) => [c.status, c._count._all]),
  );

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Входящие письма"
        description="Письма от неизвестных отправителей ожидают разбора"
      />

      <div className="flex gap-1 border-b border-[var(--border)] mb-6" role="tablist">
        {STATUS_TABS.map((tab) => {
          const isActive = tab.key === status;
          const cnt = countByStatus.get(tab.key) ?? 0;
          return (
            <Link
              key={tab.key}
              href={`/admin/crm/inbox?status=${tab.key}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                isActive
                  ? "border-[var(--color-accent)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              }`}
              role="tab"
              aria-selected={isActive}
            >
              {tab.label}
              {cnt > 0 ? (
                <span className="ml-2 inline-flex items-center px-1.5 text-xs rounded bg-[var(--color-accent-muted,#3a3a3a)] text-[var(--foreground)]">
                  {cnt}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--foreground-muted)]">Писем нет.</p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start">
                <Link
                  href={`/admin/crm/inbox/${row.id}`}
                  className="row-clickable flex-1 min-w-0 flex items-start gap-4 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      <span
                        className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-accent-muted,#3a3a3a)] text-[var(--foreground-muted)]"
                        title={row.direction === "OUTBOUND" ? "Исходящее (от менеджера)" : "Входящее"}
                      >
                        {row.direction === "OUTBOUND" ? "→ ИСХ" : "← ВХ"}
                      </span>
                      <span className="truncate">
                        {row.fromName ? `${row.fromName} <${row.fromEmail}>` : row.fromEmail}
                      </span>
                      {isBacklog(row.receivedAt, row.emailMessage?.createdAt) ? (
                        <span
                          className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground-muted)]"
                          title="Письмо получено раньше — синхронизировано позже (backlog)"
                        >
                          синхр. позже
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-[var(--foreground-muted)] truncate">
                      {row.subject || "(без темы)"}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--foreground-muted)] shrink-0">
                    {attachmentCount(row.attachments) > 0 ? (
                      <span className="mr-2">📎 {attachmentCount(row.attachments)}</span>
                    ) : null}
                    {formatDateTime(row.receivedAt)}
                  </div>
                </Link>
                {/* Разбор из списка: иначе очередь чистится только по одному
                    письму за заход в карточку и обратно. */}
                <InboxRowActions inboxMessageId={row.id} status={status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
