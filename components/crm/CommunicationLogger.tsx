"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Pencil, Phone, Trash2 } from "lucide-react";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import {
  deleteCommunication,
  logCommunication,
  markRepliesRead,
  updateCommunicationDate,
} from "@/app/actions/crm/communications";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";
import {
  COMM_CHANNEL_LABELS,
  COMM_OUTCOME_LABELS,
  DROPDOWN_CHANNELS,
  isEmailChannel,
  isInboundEmailChannel,
  isOutboundEmailChannel,
  isPhoneChannel,
} from "@/lib/crm-labels";
import { formatDateTime } from "@/lib/utils";
import { EmailReplyForm } from "@/components/crm/EmailReplyForm";

interface CommAttachment {
  id: string;
  filename: string;
  content_type?: string;
}

interface CommView {
  id: string;
  channel: string;
  outcome: string;
  body: string | null;
  durationSec: number | null;
  createdAt: Date;
  author: { id: string; name: string } | null;
  deal: { id: string; number: string | null } | null;
  /** Email-only — null for non-email rows. */
  subject?: string | null;
  attachments?: CommAttachment[];
  /** Resend's UUID — needed to build attachment proxy URLs. */
  resendEmailId?: string | null;
  /** Per-message read state. null = unread, Date = when an admin first opened
   *  the customer/deal page. Drives the unread visual treatment in EntryRow. */
  readAt?: Date | string | null;
}

interface Props {
  customerUserId: string;
  dealId?: string;
  initialEntries: CommView[];
  /** Customer's email — required to render the reply form. */
  customerEmail?: string;
}

const CHANNEL_OPTIONS = DROPDOWN_CHANNELS;
const OUTCOME_OPTIONS = Object.keys(COMM_OUTCOME_LABELS);

/**
 * Inline communications log for a customer (Customer 360 tab) or a
 * deal (Deal detail). Author-side only — the manager records the
 * touch manually. System-driven entries (smsc.ru delivery, future
 * messenger webhooks) write to the same table via separate endpoints.
 */
export function CommunicationLogger({
  customerUserId,
  dealId,
  initialEntries,
  customerEmail,
}: Props): React.ReactElement {
  const [showForm, setShowForm] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Fire markRepliesRead AFTER first paint so the user actually sees the
  // unread styling on the rows that prompted them to open this page. Running
  // this on the server before the data fetch (as we used to) flipped readAt
  // before the snapshot was rendered, making the unread treatment dead code.
  // Auth is enforced inside the server action; .catch absorbs any failure.
  useEffect(() => {
    const hasUnreadInbound = initialEntries.some(
      (e) => isInboundEmailChannel(e.channel) && e.readAt == null,
    );
    if (!hasUnreadInbound) return;
    markRepliesRead(customerUserId).catch(() => {});
  }, [customerUserId, initialEntries]);

  // The most recent EMAIL_INBOUND entry is the only one that gets the
  // "Ответить" button — replies always thread onto the latest inbound.
  // `initialEntries` is server-sorted by `createdAt: 'desc'` (both deal and
  // customer pages use the same orderBy), so reduce-by-max gives the
  // most-recent inbound id without depending on caller sort order.
  const latestInboundId = initialEntries.reduce<string | null>((acc, e) => {
    if (!isInboundEmailChannel(e.channel)) return acc;
    if (acc === null) return e.id;
    const accEntry = initialEntries.find((x) => x.id === acc);
    return accEntry && accEntry.createdAt >= e.createdAt ? acc : e.id;
  }, null);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold">История общения</h3>
        {!showForm ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<Phone size={14} />}
            onClick={() => setShowForm(true)}
          >
            Записать
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <LogForm
          customerUserId={customerUserId}
          dealId={dealId}
          onCancel={() => setShowForm(false)}
          onLogged={() => setShowForm(false)}
        />
      ) : null}

      {initialEntries.length === 0 && !showForm ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          Записей пока нет.
        </p>
      ) : null}

      {initialEntries.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {initialEntries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              canReply={
                customerEmail !== undefined &&
                e.id === latestInboundId &&
                replyingTo !== e.id
              }
              onReply={() => setReplyingTo(e.id)}
              replyForm={
                replyingTo === e.id && customerEmail ? (
                  <EmailReplyForm
                    customerUserId={customerUserId}
                    dealId={dealId ?? null}
                    customerEmail={customerEmail}
                    suggestedSubject={`Re: ${(e.subject ?? "Сообщение").replace(/^\s*Re:\s*/i, "")}`}
                    onClose={() => setReplyingTo(null)}
                  />
                ) : null
              }
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function LogForm({
  customerUserId,
  dealId,
  onCancel,
  onLogged,
}: {
  customerUserId: string;
  dealId?: string;
  onCancel: () => void;
  onLogged: () => void;
}): React.ReactElement {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(logCommunication, null);
  const [channel, setChannel] = useState("PHONE_INBOUND");

  // Notify parent + refresh after the action completes. Calling parent's
  // setState during render would trip React 19's strict cross-component
  // setState guard ("Cannot update a component while rendering a different
  // component"). Defer to commit phase via useEffect.
  useEffect(() => {
    if (state?.id && !state?.error && !isPending) {
      toast.success("Запись добавлена");
      onLogged();
      router.refresh();
    } else if (state?.error && !isPending) {
      toast.error(state.error);
    }
  }, [state, isPending, onLogged, router]);

  return (
    <form action={formAction} className="card space-y-3">
      <input type="hidden" name="customerUserId" value={customerUserId} />
      {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="comm-channel">
            Канал
          </label>
          <select
            id="comm-channel"
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="input text-sm"
          >
            {CHANNEL_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {COMM_CHANNEL_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="comm-outcome">
            Результат
          </label>
          <select id="comm-outcome" name="outcome" defaultValue="N_A" className="input text-sm">
            {OUTCOME_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {COMM_OUTCOME_LABELS[o] ?? o}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isPhoneChannel(channel) ? (
        <Input
          label="Длительность (сек)"
          name="durationSec"
          type="number"
          min="0"
          inputMode="numeric"
          placeholder="например, 180"
          className="job-line-num"
        />
      ) : null}

      <Input
        label="Когда состоялось (оставьте пустым = сейчас)"
        name="occurredAt"
        type="datetime-local"
        max={localDateTimeNow()}
      />

      <Textarea
        label="Содержание / суть разговора"
        name="body"
        rows={3}
        placeholder="Краткое содержание разговора или текст сообщения"
      />

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
          Отмена
        </Button>
        <Button type="submit" isLoading={isPending} disabled={isPending}>
          Записать
        </Button>
      </div>
    </form>
  );
}

interface EntryRowProps {
  entry: CommView;
  canReply: boolean;
  onReply: () => void;
  replyForm: React.ReactNode;
}

function EntryRow({ entry, canReply, onReply, replyForm }: EntryRowProps): React.ReactElement {
  const router = useRouter();
  const [pending, startDelete] = useTransition();
  const [editing, setEditing] = useState(false);
  const [savingDate, startSaveDate] = useTransition();
  const [dateError, setDateError] = useState<string | null>(null);
  const isEmail = isEmailChannel(entry.channel);
  const isInbound = isInboundEmailChannel(entry.channel);
  const isOutbound = isOutboundEmailChannel(entry.channel);
  // Unread visual treatment: only inbound emails that haven't been opened yet.
  // The page's CommunicationLogger fires markRepliesRead after first paint, so
  // a refresh clears this styling. `entry.readAt` may arrive as a string when
  // serialized from a server component — both undefined and null count as unread.
  const isUnread = isInbound && (entry.readAt == null);

  async function handleDelete(): Promise<void> {
    const ok = await confirm({
      message: "Удалить эту запись?",
      danger: true,
      confirmText: "Удалить",
    });
    if (!ok) return;
    startDelete(async () => {
      await deleteCommunication(entry.id);
      toast.success("Запись удалена");
    });
  }

  function handleSaveDate(form: HTMLFormElement): void {
    const value = (
      new FormData(form).get("occurredAt") as string | null
    )?.trim() ?? "";
    if (!value) {
      setDateError("Укажите дату");
      return;
    }
    setDateError(null);
    startSaveDate(async () => {
      const result = await updateCommunicationDate(entry.id, value);
      if (result.error) {
        setDateError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Дата обновлена");
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <li
      className={
        isUnread
          ? "py-3 pl-3 -ml-3 border-l-2 border-[var(--color-accent)] bg-[var(--background-elevated)]/40"
          : "py-3"
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-1.5">
            {isInbound ? <ArrowDownLeft size={14} aria-hidden /> : null}
            {isOutbound ? <ArrowUpRight size={14} aria-hidden /> : null}
            {COMM_CHANNEL_LABELS[entry.channel] ?? entry.channel}
            {isUnread ? (
              <span
                className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[var(--color-accent)] text-[var(--background)]"
                aria-label="Непрочитано"
              >
                NEW
              </span>
            ) : null}
            {entry.outcome && entry.outcome !== "N_A" ? (
              <span className="text-[var(--foreground-muted)] font-normal">
                {" · "}
                {COMM_OUTCOME_LABELS[entry.outcome] ?? entry.outcome}
              </span>
            ) : null}
          </div>
          <div className="text-xs text-[var(--foreground-muted)] mt-0.5 flex items-center gap-1.5 flex-wrap">
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveDate(e.currentTarget);
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  type="datetime-local"
                  name="occurredAt"
                  defaultValue={toLocalDateTimeValue(entry.createdAt)}
                  max={localDateTimeNow()}
                  className="input input-sm text-xs py-0.5 px-1.5"
                  disabled={savingDate}
                />
                <button
                  type="submit"
                  disabled={savingDate}
                  className="text-[var(--color-accent)] hover:underline"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDateError(null);
                  }}
                  disabled={savingDate}
                  className="hover:underline"
                >
                  Отмена
                </button>
              </form>
            ) : (
              <>
                <span>{formatDateTime(entry.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center hover:text-[var(--color-accent)] active:opacity-70 transition-opacity"
                  aria-label="Изменить дату записи"
                  title="Изменить дату записи"
                >
                  <Pencil size={11} />
                </button>
              </>
            )}
            {entry.author ? <span>· {entry.author.name}</span> : null}
            {entry.durationSec ? <span>· {formatDuration(entry.durationSec)}</span> : null}
            {dateError ? (
              <span className="text-[var(--color-error)]">{dateError}</span>
            ) : null}
          </div>
          {isEmail && entry.subject ? (
            <p className="mt-1.5 text-sm font-medium">{entry.subject}</p>
          ) : null}
          {entry.body ? (
            <EntryBody body={entry.body} truncate={isEmail} />
          ) : null}
          {isEmail && entry.attachments && entry.attachments.length > 0 && entry.resendEmailId ? (
            <ul className="flex flex-wrap gap-1.5 mt-2">
              {entry.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/admin/inbox/attachments/${a.id}?email_id=${entry.resendEmailId}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 border border-[var(--border)] rounded text-xs hover:bg-[var(--background-elevated)]"
                  >
                    📎 {a.filename}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {canReply ? (
            <button
              type="button"
              onClick={onReply}
              className="mt-2 text-xs text-[var(--color-accent)] hover:underline"
            >
              Ответить
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          data-loading={pending || undefined}
          aria-busy={pending || undefined}
          className="btn-icon shrink-0"
          aria-label="Удалить запись"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {replyForm ? <div className="mt-2">{replyForm}</div> : null}
    </li>
  );
}

function EntryBody({ body, truncate }: { body: string; truncate: boolean }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 400;
  const isLong = truncate && body.length > LIMIT;
  const visible = !isLong || expanded ? body : body.slice(0, LIMIT) + "…";
  return (
    <>
      <p className="mt-1.5 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{visible}</p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-[var(--foreground-muted)] hover:underline"
        >
          {expanded ? "Свернуть" : "Показать полностью"}
        </button>
      ) : null}
    </>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} мин ${s} сек` : `${s} сек`;
}

/** datetime-local needs `YYYY-MM-DDTHH:mm` in LOCAL time (no Z suffix). */
function localDateTimeNow(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function toLocalDateTimeValue(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
