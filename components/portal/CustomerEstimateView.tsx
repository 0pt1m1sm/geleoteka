"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Textarea } from "@/components/ui";
import {
  customerApproveEstimate,
  customerDeclineEstimate,
} from "@/app/actions/customer-estimates";
import {
  DEAL_LINE_TYPE_LABELS,
  ESTIMATE_STAGE_LABELS,
} from "@/lib/deal-stage-labels";
import { formatDate, formatPrice } from "@/lib/utils";

interface EstimateLine {
  id: string;
  type: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface EstimateView {
  id: string;
  number: string | null;
  stage: string;
  notes: string | null;
  validUntil: Date | null;
  sentAt: Date | null;
  approvedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  subtotalLabor: number;
  subtotalParts: number;
  subtotalRental: number;
  discount: number;
  total: number;
  estimateLines: EstimateLine[];
  vehicle: { make: string; model: string; year: number } | null;
}

interface Props {
  estimate: EstimateView;
  /** Guest claim token. When set, approve/decline run in guest mode. */
  claimToken?: string | null;
  /** Where the "Распечатать" link points. Omit to hide the button. */
  printHref?: string;
}

/**
 * Customer-facing estimate view. Renders the snapshot lines, totals,
 * and whole-estimate accept / decline controls. Used by both the
 * logged-in cabinet flow and the guest claim-token flow — same UI,
 * different auth path (session vs token).
 */
export function CustomerEstimateView({
  estimate,
  claimToken,
  printHref,
}: Props): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");

  const canRespond = estimate.stage === "DRAFT" || estimate.stage === "SENT";

  function approve(): void {
    setError(null);
    startTransition(async () => {
      const res = await customerApproveEstimate(estimate.id, claimToken ?? null);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function submitDecline(): void {
    if (!reason.trim()) {
      setError("Опишите причину отказа");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await customerDeclineEstimate(
        estimate.id,
        reason,
        claimToken ?? null,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      setDeclineOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
            Смета{estimate.number ? ` ${estimate.number}` : ""}
          </div>
          {estimate.vehicle ? (
            <div className="text-sm mt-1">
              {estimate.vehicle.make} {estimate.vehicle.model} {estimate.vehicle.year}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {printHref ? (
            <a
              href={printHref}
              target="_blank"
              rel="noopener"
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Распечатать ↗
            </a>
          ) : null}
          <span
            className={
              "badge text-xs " +
              (estimate.stage === "APPROVED"
                ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                : estimate.stage === "DECLINED"
                  ? "bg-[var(--color-error-bg)] text-[var(--color-error)]"
                  : "bg-[var(--background-secondary)] border border-[var(--border)]")
            }
          >
            {ESTIMATE_STAGE_LABELS[estimate.stage] ?? estimate.stage}
          </span>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-[var(--background-secondary)] text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Тип</th>
              <th className="text-left px-4 py-2 font-medium">Описание</th>
              <th className="text-right px-4 py-2 font-medium">Кол-во</th>
              <th className="text-right px-4 py-2 font-medium">Цена</th>
              <th className="text-right px-4 py-2 font-medium">Сумма</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {estimate.estimateLines.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-2 text-xs text-[var(--foreground-muted)]">
                  {DEAL_LINE_TYPE_LABELS[line.type] ?? line.type}
                </td>
                <td className="px-4 py-2">{line.description}</td>
                <td className="px-4 py-2 text-right tabular-nums">{line.qty}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatPrice(line.unitPrice)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {formatPrice(line.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-[var(--border)] p-4 space-y-1.5 text-sm">
          {estimate.subtotalLabor ? (
            <div className="flex justify-between text-[var(--foreground-muted)]">
              <span>Работы</span>
              <span className="tabular-nums">{formatPrice(estimate.subtotalLabor)}</span>
            </div>
          ) : null}
          {estimate.subtotalParts ? (
            <div className="flex justify-between text-[var(--foreground-muted)]">
              <span>Запчасти</span>
              <span className="tabular-nums">{formatPrice(estimate.subtotalParts)}</span>
            </div>
          ) : null}
          {estimate.subtotalRental ? (
            <div className="flex justify-between text-[var(--foreground-muted)]">
              <span>Аренда</span>
              <span className="tabular-nums">{formatPrice(estimate.subtotalRental)}</span>
            </div>
          ) : null}
          {estimate.discount ? (
            <div className="flex justify-between text-[var(--foreground-muted)]">
              <span>Скидки</span>
              <span className="tabular-nums">{formatPrice(estimate.discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between items-baseline pt-2 border-t border-[var(--border)]">
            <span className="text-sm font-medium">Итого к оплате</span>
            <span className="text-2xl font-bold text-[var(--color-accent)] tabular-nums">
              {formatPrice(estimate.total)}
            </span>
          </div>
        </div>
      </div>

      {estimate.validUntil ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          Смета действительна до {formatDate(estimate.validUntil)}.
        </p>
      ) : null}

      {estimate.declineReason && estimate.stage === "DECLINED" ? (
        <div className="card">
          <h3 className="font-semibold mb-2 text-sm">Причина отказа</h3>
          <p className="text-sm text-[var(--foreground-muted)]">
            {estimate.declineReason}
          </p>
        </div>
      ) : null}

      {canRespond ? (
        declineOpen ? (
          <div className="card space-y-3">
            <h3 className="font-semibold text-sm">Отказаться от сметы</h3>
            <Textarea
              label="Что не подошло?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Опишите коротко — мы свяжемся с вами"
            />
            {error ? <Alert variant="error">{error}</Alert> : null}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeclineOpen(false)}
                disabled={pending}
              >
                Назад
              </Button>
              <Button
                type="button"
                onClick={submitDecline}
                isLoading={pending}
                disabled={pending}
              >
                Подтвердить отказ
              </Button>
            </div>
          </div>
        ) : (
          <div className="card space-y-3">
            <h3 className="font-semibold text-sm">Решение по смете</h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              Подтвердите, что согласны на работы по этой смете, или
              отправьте отказ — мы свяжемся для уточнения.
            </p>
            {error ? <Alert variant="error">{error}</Alert> : null}
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                onClick={approve}
                isLoading={pending}
                disabled={pending}
              >
                Согласен
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeclineOpen(true)}
                disabled={pending}
              >
                Отказаться
              </Button>
            </div>
          </div>
        )
      ) : null}

      {estimate.notes ? (
        <p className="text-xs text-[var(--foreground-muted)] whitespace-pre-wrap">
          {estimate.notes}
        </p>
      ) : null}
    </div>
  );
}
