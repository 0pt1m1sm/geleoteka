export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";
import { InboxRowActions } from "@/components/admin/inbox/InboxRowActions";

interface Props {
  searchParams: Promise<{ status?: string }>;
}

/**
 * «Все письма» стоит первой и читает другой источник.
 *
 * Остальные вкладки — это очередь разбора: в неё попадают только письма от
 * НЕИЗВЕСТНЫХ отправителей. Письмо от узнанного клиента разбирать не нужно, оно
 * сразу ложится в его переписку и в очереди не появляется никогда — поэтому
 * очередь и не отвечала на вопрос «что вообще приходило».
 *
 * Отвечает на него EmailMessage: он создаётся ПЕРВЫМ и для каждого письма, а
 * решение «в переписку клиента или в очередь» принимается уже после. То есть
 * полный архив всё это время был, не хватало вида поверх него.
 */
const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "ALL", label: "Все письма" },
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
interface AllMailRow {
  id: string;
  direction: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  occurredAt: Date;
  attachments: unknown;
  inboxMessages: Array<{ id: string }>;
  communicationLogs: Array<{ customerUserId: string | null }>;
}

/**
 * Дата для узкого экрана: без года.
 *
 * «30 июл. 2026 г., 19:05» занимало столько, что от имени отправителя
 * оставалось «Alex Tern…». Год в почтовом ящике почти никогда не нужен —
 * письма читают свежими.
 */
function compactDateTime(d: Date): string {
  return formatDate(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

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

  const showAll = status === "ALL";

  const [rows, counts] = (await Promise.all([
    showAll
      ? Promise.resolve([])
      : db.inboxMessage.findMany({
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

  // Архив читается отдельным запросом: у него другой источник, другой порядок
  // (occurredAt — когда письмо УШЛО или ПРИШЛО, а не когда мы его синхронизировали)
  // и другое действие по клику.
  const allMail = showAll
    ? ((await db.emailMessage.findMany({
        orderBy: { occurredAt: "desc" },
        take: 100,
        select: {
          id: true,
          direction: true,
          fromEmail: true,
          fromName: true,
          toEmails: true,
          subject: true,
          occurredAt: true,
          attachments: true,
          inboxMessages: { select: { id: true }, take: 1 },
          communicationLogs: { select: { customerUserId: true }, take: 1 },
        },
      })) as AllMailRow[])
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Входящие письма"
        description={
          showAll
            ? "Вся почта сервиса — и разобранная, и нет"
            : "Письма от неизвестных отправителей ожидают разбора"
        }
      />

      <div className="flex gap-1 border-b border-[var(--border)] mb-6 overflow-x-auto whitespace-nowrap" role="tablist">
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

      {showAll ? (
        allMail.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--foreground-muted)]">Писем нет.</p>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-[var(--border)]">
              {allMail.map((m) => {
                const outbound = m.direction === "OUTBOUND";
                // Собеседник, а не «от кого»: в исходящем интересен адресат.
                const party = outbound ? (m.toEmails[0] ?? "—") : (m.fromName ?? m.fromEmail);
                // Куда письмо легло: в очередь разбора или в переписку клиента.
                const inboxId = m.inboxMessages[0]?.id ?? null;
                const customerId = m.communicationLogs[0]?.customerUserId ?? null;
                const href = inboxId
                  ? `/admin/crm/inbox/${inboxId}`
                  : customerId
                    ? `/admin/customers/${customerId}`
                    : null;
                const row = (
                  <div className="flex items-start gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        <span
                          className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-accent-muted,#3a3a3a)] text-[var(--foreground-muted)]"
                          title={outbound ? "Исходящее" : "Входящее"}
                        >
                          {outbound ? "→ ИСХ" : "← ВХ"}
                        </span>
                        <span className="truncate">{party}</span>
                        {inboxId ? (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground-muted)]">
                            в разборе
                          </span>
                        ) : customerId ? null : (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground-muted)]">
                            без клиента
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-[var(--foreground-muted)] truncate">
                        {m.subject || "(без темы)"}
                      </div>
                      <div className="sm:hidden mt-1 text-xs text-[var(--foreground-muted)]">
                        {attachmentCount(m.attachments) > 0 ? (
                          <span className="mr-2">📎 {attachmentCount(m.attachments)}</span>
                        ) : null}
                        {compactDateTime(m.occurredAt)}
                      </div>
                    </div>
                    <div className="hidden sm:block text-xs text-[var(--foreground-muted)] shrink-0">
                      {attachmentCount(m.attachments) > 0 ? (
                        <span className="mr-2">📎 {attachmentCount(m.attachments)}</span>
                      ) : null}
                      {formatDateTime(m.occurredAt)}
                    </div>
                  </div>
                );
                return (
                  <li key={m.id}>
                    {/* Письмо, не привязанное ни к очереди, ни к клиенту, открывать
                        пока некуда — ссылка в никуда хуже её отсутствия. */}
                    {href ? (
                      <Link href={href} className="row-clickable block">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--foreground-muted)]">Писем нет.</p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {/* На телефоне строка раскладывается в колонку: кнопки в одном ряду
                с именем оставляли ему 130px, и отправитель обрезался до
                «Alex Tern…». Снизу справа они не мешают ничему. */}
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col sm:flex-row sm:items-start">
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
                    {/* На телефоне дата уходит под тему: в строку она не
                        помещалась и отъедала имя отправителя. */}
                    <div className="sm:hidden mt-1 text-xs text-[var(--foreground-muted)]">
                      {attachmentCount(row.attachments) > 0 ? (
                        <span className="mr-2">📎 {attachmentCount(row.attachments)}</span>
                      ) : null}
                      {compactDateTime(row.receivedAt)}
                    </div>
                  </div>
                  <div className="hidden sm:block text-xs text-[var(--foreground-muted)] shrink-0">
                    {attachmentCount(row.attachments) > 0 ? (
                      <span className="mr-2">📎 {attachmentCount(row.attachments)}</span>
                    ) : null}
                    {formatDateTime(row.receivedAt)}
                  </div>
                </Link>
                {/* Разбор из списка: иначе очередь чистится только по одному
                    письму за заход в карточку и обратно. */}
                <div className="self-end sm:self-auto">
                  <InboxRowActions inboxMessageId={row.id} status={status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
