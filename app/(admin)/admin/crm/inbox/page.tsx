export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { InboxRowActions } from "@/components/admin/inbox/InboxRowActions";
import { InboxCard } from "@/components/admin/inbox/InboxCard";
import { InboxTabs } from "@/components/admin/inbox/InboxTabs";
import { MailPullButton } from "@/components/admin/inbox/MailPullButton";
import { readMailSyncLastRunAt } from "@/lib/email/sync-status";

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
const STATUS_TABS: Array<{ key: string; short: string; full: string }> = [
  { key: "ALL", short: "Все", full: "Все письма" },
  // «Pending» было единственным английским словом среди русских — и ничего не
  // объясняло: это письма, которые ещё не разобрали.
  { key: "PENDING", short: "Новые", full: "Новые — ждут разбора" },
  { key: "ARCHIVED", short: "Архив", full: "Архив — разобранные" },
  // Спам и корзина — два разных решения об одном и том же: письмо не нужно.
  // Держать под них две вкладки значит тратить место экрана на различие,
  // которое важно при разборе и почти не важно при просмотре.
  { key: "JUNK", short: "Мусор", full: "Спам и удалённые" },
];

/** Статусы, попадающие во вкладку. Разделение сохраняется в данных — метка на
 *  строке говорит, спам это или удалённое. */
const JUNK_STATUSES = ["SPAM", "DELETED"] as const;

interface InboxRow {
  status: string;
  toEmail: string;
  bodyText: string | null;
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

/** «Только что» честнее «0 мин назад»; дальше минуты, часы, дата. */
function formatSyncAge(date: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return formatDate(date);
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
  bodyText: string | null;
  sourceMailbox: string;
  occurredAt: Date;
  attachments: unknown;
  inboxMessages: Array<{ id: string; status: string }>;
  communicationLogs: Array<{ customerUserId: string | null }>;
}

/**
 * Дата для узкого экрана: без года.
 *
 * «30 июл. 2026 г., 19:05» занимало столько, что от имени отправителя
 * оставалось «Alex Tern…». Год в почтовом ящике почти никогда не нужен —
 * письма читают свежими.
 */
function compactDateTime(d: Date, now: Date): string {
  // Год добавляется только для писем прошлых лет — как в любом почтовом
  // клиенте: для свежей почты он шум, для старой без него не разобраться.
  const sameYear = d.getFullYear() === now.getFullYear();
  return formatDate(d, {
    dateStyle: undefined,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Начало письма одной строкой: переносы и лишние пробелы схлопнуты, иначе
 * предпросмотр занимает пол-экрана рваными обрывками.
 *
 * Обрезаем по длине только чтобы не гнать на клиент килобайты текста ради двух
 * строк. Многоточие НЕ добавляем: его ставит line-clamp по фактической ширине,
 * а своё повисало отдельной строкой посреди карточки.
 */
function previewOf(text: string | null): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.slice(0, 300) || null;
}

/** Где письмо лежит — словами, для вкладки «Все письма». */
const INBOX_STATUS_MARKS: Readonly<Record<string, string>> = {
  PENDING: "в разборе",
  ASSIGNED: "привязано",
  ARCHIVED: "в архиве",
  SPAM: "спам",
  DELETED: "в корзине",
};

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
  // Одна отметка времени на рендер: даты в списке сравниваются с одним и тем же
  // «сейчас», иначе строки на границе года разъедутся между собой.
  const now = new Date();

  const [rows, counts] = (await Promise.all([
    showAll
      ? Promise.resolve([])
      : db.inboxMessage.findMany({
      where:
        status === "JUNK"
          ? ({ status: { in: JUNK_STATUSES } } as never)
          : ({ status } as never),
      orderBy: { receivedAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        fromEmail: true,
        fromName: true,
        toEmail: true,
        subject: true,
        bodyText: true,
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
          bodyText: true,
          occurredAt: true,
          attachments: true,
          sourceMailbox: true,
          inboxMessages: { select: { id: true, status: true }, take: 1 },
          communicationLogs: { select: { customerUserId: true }, take: 1 },
        },
      })) as AllMailRow[])
    : [];

  const lastSyncAt = await readMailSyncLastRunAt();

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

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <MailPullButton />
        <span className="text-sm text-[var(--foreground-muted)]">
          {lastSyncAt
            ? `Почта проверялась: ${formatSyncAge(lastSyncAt)}`
            : "Почта ещё не проверялась — фоновая проверка идёт раз в минуту"}
        </span>
      </div>

      <InboxTabs
        active={status}
        tabs={STATUS_TABS.map((t) => ({
          key: t.key,
          short: t.short,
          full: t.full,
          count:
            t.key === "JUNK"
              ? JUNK_STATUSES.reduce((sum, st) => sum + (countByStatus.get(st) ?? 0), 0)
              : (countByStatus.get(t.key) ?? 0),
        }))}
      />

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
                const inbox = m.inboxMessages[0] ?? null;
                const inboxId = inbox?.id ?? null;
                const customerId = m.communicationLogs[0]?.customerUserId ?? null;
                return (
                  <li key={m.id}>
                    <InboxCard
                      // Письмо, не привязанное ни к очереди, ни к клиенту,
                      // открывать некуда — ссылка в никуда хуже её отсутствия.
                      href={
                        inboxId
                          ? `/admin/crm/inbox/${inboxId}`
                          : customerId
                            ? `/admin/customers/${customerId}`
                            : null
                      }
                      subject={m.subject}
                      preview={previewOf(m.bodyText)}
                      outbound={outbound}
                      party={outbound ? (m.toEmails[0] ?? "—") : m.fromEmail}
                      time={compactDateTime(m.occurredAt, now)}
                      folder={m.sourceMailbox}
                      attachments={attachmentCount(m.attachments)}
                      // Метка говорит, ГДЕ письмо лежит. Раньше здесь стояло
                      // «в разборе» для всего, у чего есть строка в очереди, —
                      // но в очереди четыре разных статуса, и спам подписывался
                      // как ожидающий разбора.
                      marks={
                        inbox
                          ? [INBOX_STATUS_MARKS[inbox.status] ?? inbox.status]
                          : customerId
                            ? []
                            : ["без клиента"]
                      }
                      // Действия и здесь: письмо в общем списке ничем не хуже
                      // письма во вкладке, а состояние у него своё.
                      actions={
                        inbox ? (
                          <InboxRowActions
                            inboxMessageId={inbox.id}
                            status={inbox.status}
                            canDestroy={session.permissionRole === "ADMIN"}
                          />
                        ) : null
                      }
                    />
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
            {rows.map((row) => (
              <li key={row.id}>
                <InboxCard
                  href={`/admin/crm/inbox/${row.id}`}
                  subject={row.subject}
                  preview={previewOf(row.bodyText)}
                  outbound={row.direction === "OUTBOUND"}
                  party={row.direction === "OUTBOUND" ? row.toEmail : row.fromEmail}
                  time={compactDateTime(row.receivedAt, now)}
                  folder={row.toEmail}
                  attachments={attachmentCount(row.attachments)}
                  marks={[
                    // Во вкладке «Спам и удалённые» лежат оба статуса, и
                    // отличить их можно только меткой.
                    ...(status === "JUNK" ? [row.status === "SPAM" ? "спам" : "удалено"] : []),
                    ...(isBacklog(row.receivedAt, row.emailMessage?.createdAt)
                      ? ["синхр. позже"]
                      : []),
                  ]}
                  // Разбор из списка: иначе очередь чистится только по одному
                  // письму за заход в карточку и обратно.
                  actions={
                    <InboxRowActions
                      inboxMessageId={row.id}
                      status={status}
                      canDestroy={session.permissionRole === "ADMIN"}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
