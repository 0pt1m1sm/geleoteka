export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { emailAttachmentHref } from "@/lib/email/attachment-url";
import { InboxActions } from "@/components/admin/inbox/InboxActions";
import { EmailBodyFrame } from "@/components/admin/inbox/EmailBodyFrame";

interface Props {
  params: Promise<{ id: string }>;
}

interface AttachmentMeta {
  id: string;
  filename: string;
  content_type: string;
  content_disposition?: string;
}

interface InboxDetail {
  id: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: unknown;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  // Nullable since the Timeweb migration — IMAP rows have no Resend UUID.
  resendEmailId: string | null;
  emailMessageId: string | null;
  direction: string;
  receivedAt: Date;
  status: string;
  assignedTo: { id: string; name: string } | null;
  linkedCommunicationLogId: string | null;
  emailMessage: { createdAt: Date; occurredAtEstimated: boolean } | null;
}

const BACKLOG_GAP_MS = 10 * 60 * 1000;

function parseAttachments(value: unknown): AttachmentMeta[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (it): it is AttachmentMeta =>
      typeof it === "object" && it !== null && typeof (it as AttachmentMeta).id === "string",
  );
}

export default async function InboxMessagePage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }
  const { id } = await params;

  const msg = (await db.inboxMessage.findUnique({
    where: { id },
    select: {
      id: true,
      fromEmail: true,
      fromName: true,
      toEmail: true,
      subject: true,
      bodyText: true,
      bodyHtml: true,
      attachments: true,
      messageId: true,
      inReplyTo: true,
      references: true,
      resendEmailId: true,
      emailMessageId: true,
      direction: true,
      receivedAt: true,
      status: true,
      assignedTo: { select: { id: true, name: true } },
      linkedCommunicationLogId: true,
      emailMessage: { select: { createdAt: true, occurredAtEstimated: true } },
    },
  })) as InboxDetail | null;
  if (!msg) notFound();

  const attachments = parseAttachments(msg.attachments);
  const isActionable = msg.status === "PENDING";

  return (
    <div>
      <PageHeader
        eyebrow="Входящие"
        title={msg.subject || "(без темы)"}
        description={`От: ${msg.fromName ? `${msg.fromName} <${msg.fromEmail}>` : msg.fromEmail} · ${formatDateTime(msg.receivedAt)}`}
        actions={
          <Link href="/admin/crm/inbox" className="back-link">
            ← К списку
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          <Card>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
              <dt className="text-[var(--foreground-muted)]">Направление</dt>
              <dd>
                {msg.direction === "OUTBOUND"
                  ? "Исходящее (от менеджера)"
                  : "Входящее (от клиента)"}
                {msg.emailMessage &&
                new Date(msg.emailMessage.createdAt).getTime() - new Date(msg.receivedAt).getTime() >
                  BACKLOG_GAP_MS ? (
                  <span
                    className="ml-2 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground-muted)]"
                    title="Письмо получено раньше — синхронизировано позже (backlog)"
                  >
                    синхр. позже
                  </span>
                ) : null}
              </dd>
              <dt className="text-[var(--foreground-muted)]">Статус</dt>
              <dd>{msg.status}</dd>
              <dt className="text-[var(--foreground-muted)]">
                {msg.direction === "OUTBOUND" ? "От (мы)" : "От"}
              </dt>
              <dd className="break-all">
                {msg.fromName ? `${msg.fromName} <${msg.fromEmail}>` : msg.fromEmail}
              </dd>
              <dt className="text-[var(--foreground-muted)]">Кому</dt>
              <dd className="break-all">{msg.toEmail}</dd>
              <dt className="text-[var(--foreground-muted)]">Message-Id</dt>
              <dd className="font-mono text-xs break-all">{msg.messageId}</dd>
              {msg.inReplyTo ? (
                <>
                  <dt className="text-[var(--foreground-muted)]">In-Reply-To</dt>
                  <dd className="font-mono text-xs break-all">{msg.inReplyTo}</dd>
                </>
              ) : null}
              {msg.assignedTo ? (
                <>
                  <dt className="text-[var(--foreground-muted)]">Привязал</dt>
                  <dd>{msg.assignedTo.name}</dd>
                </>
              ) : null}
            </dl>
          </Card>

          {attachments.length > 0 ? (
            <Card>
              <h3 className="font-semibold mb-3">Вложения</h3>
              <ul className="flex flex-wrap gap-2">
                {attachments.map((a) => {
                  const href = emailAttachmentHref(msg, a.id);
                  return (
                    <li key={a.id}>
                      {href ? (
                        <a
                          href={href}
                          className="inline-flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] rounded text-sm hover:bg-[var(--background-elevated)]"
                        >
                          📎 {a.filename}
                        </a>
                      ) : (
                        <span
                          className="inline-flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] rounded text-sm text-[var(--foreground-muted)]"
                          title="Файл больше недоступен"
                        >
                          📎 {a.filename}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card>
            <h3 className="font-semibold mb-3">Содержимое</h3>
            {msg.bodyHtml ? (
              <EmailBodyFrame html={msg.bodyHtml} />
            ) : msg.bodyText ? (
              <pre className="text-sm whitespace-pre-wrap font-sans">{msg.bodyText}</pre>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">(пусто)</p>
            )}
          </Card>
        </div>

        <div>
          <Card>
            <h3 className="font-semibold mb-3">Действия</h3>
            {isActionable ? (
              <InboxActions
                inboxMessageId={msg.id}
                fromEmail={msg.fromEmail}
                fromName={msg.fromName}
                toEmail={msg.toEmail}
                direction={msg.direction}
              />
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">
                Сообщение в статусе {msg.status} — действия недоступны.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
