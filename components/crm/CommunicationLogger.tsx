"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, Trash2 } from "lucide-react";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import {
  deleteCommunication,
  logCommunication,
} from "@/app/actions/crm/communications";
import {
  COMM_CHANNEL_LABELS,
  COMM_OUTCOME_LABELS,
  isPhoneChannel,
} from "@/lib/crm-labels";
import { formatDateTime } from "@/lib/utils";

interface CommView {
  id: string;
  channel: string;
  outcome: string;
  body: string | null;
  durationSec: number | null;
  createdAt: Date;
  author: { id: string; name: string } | null;
  deal: { id: string; number: string | null } | null;
}

interface Props {
  customerUserId: string;
  dealId?: string;
  initialEntries: CommView[];
}

const CHANNEL_OPTIONS = Object.keys(COMM_CHANNEL_LABELS);
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
}: Props): React.ReactElement {
  const [showForm, setShowForm] = useState(false);

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
            <EntryRow key={e.id} entry={e} />
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

  if (state?.id && !state?.error && !isPending) {
    onLogged();
    router.refresh();
  }

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

function EntryRow({ entry }: { entry: CommView }): React.ReactElement {
  const [pending, startDelete] = useTransition();

  function handleDelete(): void {
    if (!confirm("Удалить эту запись?")) return;
    startDelete(async () => {
      await deleteCommunication(entry.id);
    });
  }

  return (
    <li className="py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          {COMM_CHANNEL_LABELS[entry.channel] ?? entry.channel}
          {entry.outcome && entry.outcome !== "N_A" ? (
            <span className="text-[var(--foreground-muted)] font-normal">
              {" · "}
              {COMM_OUTCOME_LABELS[entry.outcome] ?? entry.outcome}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
          {formatDateTime(entry.createdAt)}
          {entry.author ? ` · ${entry.author.name}` : ""}
          {entry.durationSec ? ` · ${formatDuration(entry.durationSec)}` : ""}
        </div>
        {entry.body ? (
          <p className="mt-1.5 text-sm whitespace-pre-wrap">{entry.body}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="btn-icon shrink-0"
        aria-label="Удалить запись"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} мин ${s} сек` : `${s} сек`;
}
