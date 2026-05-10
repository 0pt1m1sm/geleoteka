"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import { createEstimate, sendEstimate } from "@/app/actions/crm/estimates";
import { ESTIMATE_STAGE_LABELS } from "@/lib/deal-stage-labels";
import { formatDate, formatPrice } from "@/lib/utils";

interface EstimateView {
  id: string;
  number: string | null;
  stage: string;
  total: number;
  sentAt: Date | null;
  validUntil: Date | null;
  createdAt: Date;
}

interface Props {
  dealId: string;
  estimates: EstimateView[];
  /** Disables "Создать смету" once the deal moves past QUOTED. */
  canCreate: boolean;
}

/**
 * Embedded on the Deal detail page. Shows existing estimates, lets the
 * manager spawn a new DRAFT from current DealLines, and offers a quick
 * "send" trigger for any DRAFT row.
 */
export function EstimatesSection({
  dealId,
  estimates,
  canCreate,
}: Props): React.ReactElement {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold">Сметы</h3>
        {canCreate && !createOpen ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
          >
            Новая смета
          </Button>
        ) : null}
      </div>

      {createOpen ? (
        <CreateEstimateForm
          dealId={dealId}
          onCancel={() => setCreateOpen(false)}
          onCreated={() => setCreateOpen(false)}
        />
      ) : null}

      {estimates.length === 0 && !createOpen ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          Сметы по этой сделке ещё не созданы.
        </p>
      ) : null}

      {estimates.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {estimates.map((est) => (
            <EstimateRow key={est.id} est={est} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CreateEstimateForm({
  dealId,
  onCancel,
  onCreated,
}: {
  dealId: string;
  onCancel: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createEstimate, null);

  // Once the action returns success, navigate user to the estimate.
  if (state?.estimateId && !state?.error && !isPending) {
    onCreated();
    router.push(`/admin/crm/estimates/${state.estimateId}`);
  }

  return (
    <form action={formAction} className="card space-y-3 mb-3">
      <input type="hidden" name="dealId" value={dealId} />
      <p className="text-xs text-[var(--foreground-muted)]">
        Смета будет создана из текущих позиций сделки. После создания
        дальнейшие правки сделки не влияют на смету — используйте
        «Пересмотреть», чтобы выпустить новую версию.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input
          label="Действительна дней"
          name="validDays"
          type="number"
          inputMode="numeric"
          min="1"
          defaultValue="14"
          className="job-line-num"
        />
        <div className="sm:col-span-2">
          <Textarea
            label="Внутренние заметки (опционально)"
            name="notes"
            rows={2}
            placeholder="Не отправляется клиенту"
          />
        </div>
      </div>

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
          Отмена
        </Button>
        <Button type="submit" isLoading={isPending} disabled={isPending}>
          Создать
        </Button>
      </div>
    </form>
  );
}

function EstimateRow({ est }: { est: EstimateView }): React.ReactElement {
  const router = useRouter();
  const [pending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSend(): void {
    setError(null);
    startSend(async () => {
      const res = await sendEstimate(est.id);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  return (
    <li className="py-2 flex items-center gap-3">
      <FileText
        size={16}
        className="text-[var(--foreground-muted)] shrink-0"
        aria-hidden
      />
      <Link
        href={`/admin/crm/estimates/${est.id}`}
        className="flex-1 min-w-0 hover:text-[var(--color-accent)]"
      >
        <div className="text-sm font-medium truncate">
          {est.number ?? "Без номера"} · {ESTIMATE_STAGE_LABELS[est.stage] ?? est.stage}
        </div>
        <div className="text-xs text-[var(--foreground-muted)]">
          {est.sentAt ? `Отправлена ${formatDate(est.sentAt)}` : `Создана ${formatDate(est.createdAt)}`}
          {est.validUntil ? ` · действует до ${formatDate(est.validUntil)}` : ""}
        </div>
        {error ? (
          <div className="text-xs text-[var(--color-error)] mt-0.5">{error}</div>
        ) : null}
      </Link>
      <div className="text-sm font-medium tabular-nums shrink-0">
        {formatPrice(est.total)}
      </div>
      {est.stage === "DRAFT" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isLoading={pending}
          disabled={pending}
          onClick={handleSend}
        >
          Отправить
        </Button>
      ) : null}
    </li>
  );
}
