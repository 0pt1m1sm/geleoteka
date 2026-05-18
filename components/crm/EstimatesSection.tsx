"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import {
  openOrCreateActiveEstimate,
  sendEstimate,
} from "@/app/actions/crm/estimates";
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
  /** Disables the active-estimate button once the deal moves past QUOTED. */
  canCreate: boolean;
}

/**
 * Embedded on the Deal detail page. Lists every estimate (including
 * superseded revisions) and exposes a single "Открыть активную смету"
 * button that routes the manager to:
 *   - the current DRAFT, if one exists
 *   - else a new DRAFT cloned from the latest non-SUPERSEDED estimate
 *     (via `reviseEstimate` inside `openOrCreateActiveEstimate`)
 *   - else a blank DRAFT (legacy fallback)
 *
 * Editing of line items happens on the estimate page itself — never
 * inline here. PDF + "Отправить" stay one click away per row.
 */
export function EstimatesSection({
  dealId,
  estimates,
  canCreate,
}: Props): React.ReactElement {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(openOrCreateActiveEstimate, null);

  useEffect(() => {
    if (state?.estimateId && !state?.error && !isPending) {
      router.push(`/admin/crm/estimates/${state.estimateId}`);
    }
  }, [state, isPending, router]);

  const hasDraft = estimates.some((e) => e.stage === "DRAFT");
  const buttonLabel = hasDraft ? "Открыть активную смету" : "Новая смета";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold">Сметы</h3>
        {canCreate ? (
          <form action={formAction}>
            <input type="hidden" name="dealId" value={dealId} />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              leftIcon={<Plus size={14} />}
              isLoading={isPending}
              disabled={isPending}
            >
              {buttonLabel}
            </Button>
          </form>
        ) : null}
      </div>

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

      {estimates.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          Сметы по этой сделке ещё не созданы.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {estimates.map((est) => (
            <EstimateRow key={est.id} est={est} />
          ))}
        </ul>
      )}
    </div>
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
      <a
        href={`/api/estimates/${est.id}/pdf`}
        target="_blank"
        rel="noopener"
        className="text-xs text-[var(--color-accent)] hover:underline shrink-0"
        title="Скачать PDF"
      >
        PDF ↗
      </a>
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
