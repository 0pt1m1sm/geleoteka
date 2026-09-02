export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { getSyncHealth, type MailSyncDb, type SyncHealth } from "@/lib/email/sync";
import { MailSyncReplayButton } from "@/components/admin/settings/MailSyncReplayButton";

/**
 * Operator view of the Timeweb IMAP sync. Everything here comes from the cursor
 * table (`getSyncHealth`) and the DEAD `EmailMessage` rows — never from a mailbox
 * password or the raw container logs. `lastError` is already redacted to a single
 * capped line by the sync loop, and no field on `SyncHealth` carries a secret, so
 * this page cannot leak credentials.
 */

/** How stale a source may get before we flag it — matches the worker's alert. */
const STALE_MS = 5 * 60 * 1000;

interface DeadRow {
  id: string;
  sourceMailbox: string;
  sourceFolder: string;
  uid: bigint | null;
  ingestError: string | null;
  ingestAttempts: number;
  occurredAt: Date;
}

function stalenessLabel(lastSuccessAt: Date | null, now: number): { text: string; stale: boolean } {
  if (!lastSuccessAt) return { text: "ни одного успешного прохода", stale: true };
  const ageMs = now - new Date(lastSuccessAt).getTime();
  const mins = Math.floor(ageMs / 60000);
  const text = mins <= 0 ? "меньше минуты назад" : `${mins} мин назад`;
  return { text, stale: ageMs > STALE_MS };
}

export default async function MailSyncDiagnosticsPage() {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  const session = await getSession();
  if (!session || session.permissionRole !== "ADMIN") redirect("/login");

  const now = new Date().getTime();
  const [health, deadRows] = (await Promise.all([
    getSyncHealth(db as unknown as MailSyncDb),
    db.emailMessage.findMany({
      where: { ingestStatus: "DEAD" },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        sourceMailbox: true,
        sourceFolder: true,
        uid: true,
        ingestError: true,
        ingestAttempts: true,
        occurredAt: true,
      },
    }),
  ])) as [SyncHealth[], DeadRow[]];

  const totalDead = health.reduce((n, h) => n + h.deadLetters, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Настройки → Интеграции"
        title="Синхронизация почты (IMAP)"
        description="Состояние воркера Timeweb IMAP: последний проход, отставание, dead-letter. Пароли ящиков здесь не отображаются."
        actions={
          <Link
            href="/admin/settings/integrations"
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            ← К настройкам интеграций
          </Link>
        }
      />

      {health.length === 0 ? (
        <Card className="text-center py-12 space-y-2">
          <p className="text-[var(--foreground-muted)]">Ни одного источника ещё не синхронизировалось.</p>
          <p className="text-xs text-[var(--foreground-muted)]">
            Воркер не запускался, либо <span className="font-mono">MAIL_SYNC_ENABLED</span> выключен /
            <span className="font-mono"> MAIL_SYNC_SOURCES</span> пуст.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-[var(--foreground-muted)]">
              Источников: <strong className="text-[var(--foreground)]">{health.length}</strong>
            </span>
            <span className="text-[var(--foreground-muted)]">
              Всего dead-letter:{" "}
              <strong className={totalDead > 0 ? "text-[var(--color-error)]" : "text-[var(--foreground)]"}>
                {totalDead}
              </strong>
            </span>
          </div>

          <ul className="space-y-3">
            {health.map((h) => {
              const staleness = stalenessLabel(h.lastSuccessAt, now);
              return (
                <li key={`${h.mailbox}/${h.folder}`}>
                  <Card>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-medium font-mono text-sm break-all">
                          {h.mailbox}/{h.folder}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant={h.role === "OUTBOUND_ARCHIVE" ? "info" : "neutral"}>
                            {h.role === "OUTBOUND_ARCHIVE" ? "исходящие (архив)" : "входящие"}
                          </Badge>
                          {h.lastError ? (
                            <Badge variant="error">ошибка соединения</Badge>
                          ) : staleness.stale ? (
                            <Badge variant="warning">отстаёт</Badge>
                          ) : (
                            <Badge variant="success">в норме</Badge>
                          )}
                          {h.deadLetters > 0 ? (
                            <Badge variant="error">dead: {h.deadLetters}</Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-[160px_1fr] gap-y-1 text-sm">
                      <dt className="text-[var(--foreground-muted)]">Последний успех</dt>
                      <dd className={staleness.stale ? "text-[var(--color-error)]" : ""}>
                        {h.lastSuccessAt ? `${formatDateTime(h.lastSuccessAt)} · ${staleness.text}` : staleness.text}
                      </dd>

                      <dt className="text-[var(--foreground-muted)]">Последний UID</dt>
                      <dd className="font-mono text-xs">{h.lastUid !== null ? h.lastUid.toString() : "—"}</dd>

                      <dt className="text-[var(--foreground-muted)]">UIDVALIDITY</dt>
                      <dd className="font-mono text-xs">
                        {h.uidValidity !== null ? h.uidValidity.toString() : "—"}
                      </dd>

                      <dt className="text-[var(--foreground-muted)]">Обрабатывает</dt>
                      <dd className="font-mono text-xs break-all">
                        {h.leaseOwner
                          ? `${h.leaseOwner}${h.leaseUntil ? ` (до ${formatDateTime(h.leaseUntil)})` : ""}`
                          : "свободен"}
                      </dd>

                      {h.lastError ? (
                        <>
                          <dt className="text-[var(--foreground-muted)]">Ошибка</dt>
                          <dd className="text-[var(--color-error)] text-xs break-all">{h.lastError}</dd>
                        </>
                      ) : null}
                    </dl>
                  </Card>
                </li>
              );
            })}
          </ul>

          <div>
            <h2 className="text-sm font-semibold mb-2 mt-6">Dead-letter — требуют ручного воспроизведения</h2>
            {deadRows.length === 0 ? (
              <Card>
                <p className="text-sm text-[var(--foreground-muted)]">Непрочитанных poison-писем нет.</p>
              </Card>
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-[var(--border)]">
                  {deadRows.map((r) => (
                    <li key={r.id} className="px-4 py-3 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs break-all">
                          {r.sourceMailbox}/{r.sourceFolder} · UID {r.uid !== null ? r.uid.toString() : "—"}
                        </div>
                        <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                          {formatDateTime(r.occurredAt)} · попыток: {r.ingestAttempts}
                        </div>
                        {r.ingestError ? (
                          <p className="text-xs text-[var(--color-error)] mt-1 break-all">{r.ingestError}</p>
                        ) : null}
                      </div>
                      <MailSyncReplayButton emailMessageId={r.id} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
