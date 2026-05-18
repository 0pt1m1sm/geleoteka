export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { InboxActions } from "@/components/admin/inbox/InboxActions";

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
  resendEmailId: string;
  receivedAt: Date;
  status: string;
  assignedTo: { id: string; name: string } | null;
  linkedCommunicationLogId: string | null;
}

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
      receivedAt: true,
      status: true,
      assignedTo: { select: { id: true, name: true } },
      linkedCommunicationLogId: true,
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
          <Link
            href="/admin/crm/inbox"
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            ← К списку
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          <Card>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
              <dt className="text-[var(--foreground-muted)]">Статус</dt>
              <dd>{msg.status}</dd>
              <dt className="text-[var(--foreground-muted)]">Кому</dt>
              <dd>{msg.toEmail}</dd>
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
                {attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api/admin/inbox/attachments/${a.id}?email_id=${msg.resendEmailId}`}
                      className="inline-flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] rounded text-sm hover:bg-[var(--background-elevated)]"
                    >
                      📎 {a.filename}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <h3 className="font-semibold mb-3">Содержимое</h3>
            {msg.bodyHtml ? (
              <iframe
                sandbox=""
                srcDoc={msg.bodyHtml}
                className="w-full min-h-[400px] border border-[var(--border)] rounded bg-white"
                title="Содержимое письма"
              />
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
