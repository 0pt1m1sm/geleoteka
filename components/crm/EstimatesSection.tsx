"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import {
  deleteEstimate,
  openOrCreateActiveEstimate,
  sendEstimate,
} from "@/app/actions/crm/estimates";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";
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
        <EstimatesList estimates={estimates} />
      )}
    </div>
  );
}

function EstimatesList({ estimates }: { estimates: EstimateView[] }): React.ReactElement {
  // SUPERSEDED rows are previous revisions of the active estimate (reviseEstimate
  // marks the parent SUPERSEDED whenever a new DRAFT child is cloned). Collapse
  // them into a single "История версий (N)" expander so the list isn't dominated
  // by clones at the same price. Active rows render first, freshest on top.
  const active = estimates.filter((e) => e.stage !== "SUPERSEDED");
  const superseded = estimates.filter((e) => e.stage === "SUPERSEDED");
  // Version numbers go oldest=v1 → newest=vN across the whole timeline.
  // estimates arrive createdAt desc, so reverse-index by length.
  const versionByCreatedAt = new Map<string, number>();
  [...estimates]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .forEach((e, i) => versionByCreatedAt.set(e.id, i + 1));

  return (
    <div className="mt-3">
      {active.length > 0 ? (
        <ul className="divide-y divide-[var(--border)]">
          {active.map((est) => (
            <EstimateRow
              key={est.id}
              est={est}
              version={versionByCreatedAt.get(est.id)}
              totalVersions={estimates.length}
            />
          ))}
        </ul>
      ) : null}

      {superseded.length > 0 ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] py-2 flex items-center gap-1.5 select-none">
            <span className="inline-block transition-transform group-open:rotate-90">›</span>
            История версий ({superseded.length})
          </summary>
          <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)] pt-1">
            {superseded.map((est) => (
              <EstimateRow
                key={est.id}
                est={est}
                version={versionByCreatedAt.get(est.id)}
                totalVersions={estimates.length}
                compact
              />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function EstimateRow({
  est,
  version,
  totalVersions,
  compact = false,
}: {
  est: EstimateView;
  version?: number;
  totalVersions?: number;
  compact?: boolean;
}): React.ReactElement {
  const router = useRouter();
  const [pending, startSend] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canDelete = est.stage !== "APPROVED";
  const versionLabel =
    version && totalVersions && totalVersions > 1 ? `v${version}` : null;

  function handleSend(): void {
    setError(null);
    startSend(async () => {
      const res = await sendEstimate(est.id);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  async function handleDelete(): Promise<void> {
    const stageRu =
      ESTIMATE_STAGE_LABELS[est.stage]?.toLowerCase() ?? "эту смету";
    const which =
      stageRu === "пересмотрена"
        ? "пересмотренную смету"
        : stageRu === "одобрена"
          ? "согласованную смету"
          : `смету (${stageRu})`;
    const ok = await confirm({
      title: "Удалить смету",
      message: `Удалить ${which}? Действие необратимо.`,
      danger: true,
      confirmText: "Удалить",
    });
    if (!ok) return;
    setError(null);
    startDelete(async () => {
      const res = await deleteEstimate(est.id);
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Смета удалена");
      router.refresh();
    });
  }

  return (
    <li className={compact ? "py-1.5 flex items-center gap-2" : "py-2 flex items-center gap-3"}>
      <FileText
        size={compact ? 14 : 16}
        className="text-[var(--foreground-muted)] shrink-0"
        aria-hidden
      />
      <Link
        href={`/admin/crm/estimates/${est.id}`}
        className="row-clickable flex-1 min-w-0 hover:text-[var(--color-accent)] -mx-2 px-2 py-1 rounded active:opacity-70 transition-opacity"
      >
        <div className={compact ? "text-xs truncate" : "text-sm font-medium truncate"}>
          {est.number ?? "Без номера"} · {ESTIMATE_STAGE_LABELS[est.stage] ?? est.stage}
          {versionLabel ? (
            <span className="ml-1.5 text-[10px] text-[var(--foreground-muted)] font-normal">
              {versionLabel}
            </span>
          ) : null}
        </div>
        {!compact ? (
          <div className="text-xs text-[var(--foreground-muted)]">
            {est.sentAt ? `Отправлена ${formatDate(est.sentAt)}` : `Создана ${formatDate(est.createdAt)}`}
            {est.validUntil ? ` · действует до ${formatDate(est.validUntil)}` : ""}
          </div>
        ) : null}
        {error ? (
          <div className="text-xs text-[var(--color-error)] mt-0.5">{error}</div>
        ) : null}
      </Link>
      <div className={compact ? "text-xs tabular-nums shrink-0 text-[var(--foreground-muted)]" : "text-sm font-medium tabular-nums shrink-0"}>
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
      {!compact && est.stage === "DRAFT" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isLoading={pending}
          disabled={pending || deleting}
          onClick={handleSend}
        >
          Отправить
        </Button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting || pending}
          aria-label="Удалить смету"
          title="Удалить смету"
          className="btn-icon shrink-0 hover:text-[var(--color-error)]"
        >
          <Trash2 size={compact ? 12 : 14} />
        </button>
      ) : null}
    </li>
  );
}
