export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

const OUTCOME_LABELS: Record<string, { ru: string; tone: "good" | "neutral" | "bad" }> = {
  accepted_thread: { ru: "✓ Принято (треды)", tone: "good" },
  accepted_customer: { ru: "✓ Принято (известный клиент)", tone: "good" },
  accepted_inbox: { ru: "✓ Принято (неизвестный → инбокс)", tone: "good" },
  duplicate: { ru: "Дубликат", tone: "neutral" },
  rejected_signature: { ru: "✗ HMAC не сошёлся", tone: "bad" },
  ignored_recipient: { ru: "Игнор — не наш recipient", tone: "neutral" },
  ignored_type: { ru: "Игнор — другой тип события", tone: "neutral" },
  error_no_secret: { ru: "✗ RESEND_WEBHOOK_SECRET не задан", tone: "bad" },
  error_no_api_key: { ru: "✗ RESEND_API_KEY не задан", tone: "bad" },
  error_upstream: { ru: "✗ Не дотянулись до Resend API", tone: "bad" },
  error_other: { ru: "✗ Прочая ошибка", tone: "bad" },
};

interface Row {
  id: string;
  receivedAt: Date;
  httpStatus: number;
  outcome: string;
  detail: string | null;
  recipient: string | null;
  fromEmail: string | null;
  messageId: string | null;
  hasSvixId: boolean;
  hasSig: boolean;
  hasTs: boolean;
}

export default async function InboundLogPage() {
  const session = await getSession();
  if (!session || session.permissionRole !== "ADMIN") redirect("/login");

  const rows = (await db.inboundAttempt.findMany({
    orderBy: { receivedAt: "desc" },
    take: 30,
  })) as Row[];

  return (
    <div>
      <PageHeader
        eyebrow="Настройки → Интеграции"
        title="Лог входящих webhook-ов"
        description="Последние 30 попыток POST /api/email/inbound. Помогает понять что именно отправляет Resend (или не отправляет вовсе)."
        actions={
          <Link
            href="/admin/settings/integrations"
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            ← К настройкам интеграций
          </Link>
        }
      />

      {rows.length === 0 ? (
        <Card className="text-center py-12 space-y-2">
          <p className="text-[var(--foreground-muted)]">Ни одной попытки не зафиксировано.</p>
          <p className="text-xs text-[var(--foreground-muted)]">
            Это значит Resend ВООБЩЕ не достучался до нашего endpoint. Проверьте в Resend dashboard → Webhooks:<br/>
            1. URL endpoint = https://geleoteka.ru/api/email/inbound<br/>
            2. Подписка на event type <span className="font-mono">email.received</span><br/>
            3. Webhook включён (Active).
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((r) => {
              const meta = OUTCOME_LABELS[r.outcome] ?? { ru: r.outcome, tone: "neutral" };
              const toneClass =
                meta.tone === "good"
                  ? "text-[var(--color-accent)]"
                  : meta.tone === "bad"
                    ? "text-[var(--color-error)]"
                    : "text-[var(--foreground-muted)]";
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-sm font-medium ${toneClass}`}>
                      {meta.ru} <span className="text-[var(--foreground-muted)] font-normal">({r.httpStatus})</span>
                    </span>
                    <span className="text-xs text-[var(--foreground-muted)] shrink-0">
                      {formatDateTime(r.receivedAt)}
                    </span>
                  </div>
                  {r.detail ? (
                    <p className="text-xs mt-1 font-mono break-all">{r.detail}</p>
                  ) : null}
                  <div className="text-xs text-[var(--foreground-muted)] mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {r.fromEmail ? <span>от: <span className="font-mono">{r.fromEmail}</span></span> : null}
                    {r.recipient ? <span>кому: <span className="font-mono">{r.recipient}</span></span> : null}
                    {r.messageId ? <span>msg-id: <span className="font-mono">{r.messageId.slice(0,30)}{r.messageId.length > 30 ? "…" : ""}</span></span> : null}
                  </div>
                  <div className="text-xs mt-1">
                    <span className={r.hasSvixId ? "text-[var(--color-accent)]" : "text-[var(--color-error)]"}>
                      svix-id {r.hasSvixId ? "✓" : "✗"}
                    </span>
                    {" · "}
                    <span className={r.hasSig ? "text-[var(--color-accent)]" : "text-[var(--color-error)]"}>
                      svix-signature {r.hasSig ? "✓" : "✗"}
                    </span>
                    {" · "}
                    <span className={r.hasTs ? "text-[var(--color-accent)]" : "text-[var(--color-error)]"}>
                      svix-timestamp {r.hasTs ? "✓" : "✗"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
