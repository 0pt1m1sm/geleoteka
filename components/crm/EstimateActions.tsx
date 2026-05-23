"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { Alert, Button, Textarea } from "@/components/ui";
import {
  approveEstimate,
  declineEstimate,
  deleteEstimate,
  reviseEstimate,
  sendEstimate,
  unapproveEstimate,
} from "@/app/actions/crm/estimates";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

interface Props {
  estimateId: string;
  stage: string;
}

type ActionResult = { error: string | null; estimateId?: string };

/**
 * Stage-transition + lifecycle buttons for a single Estimate. Each stage
 * exposes its valid forward transitions plus a Delete option (soft policy:
 * APPROVED must be unapproved first). Decline opens an inline reason
 * form — no native prompt().
 */
export function EstimateActions({
  estimateId,
  stage,
}: Props): React.ReactElement | null {
  const router = useRouter();
  const nav = useProgressRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  function run(
    action: () => Promise<ActionResult>,
    onSuccess?: { redirect?: string; toast?: string },
  ): void {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      if (onSuccess?.toast) toast.success(onSuccess.toast);
      if (onSuccess?.redirect) {
        nav.push(onSuccess.redirect);
        return;
      }
      // Revision creates a child estimate; navigate there.
      if (res.estimateId && res.estimateId !== estimateId) {
        nav.push(`/admin/crm/estimates/${res.estimateId}`);
        return;
      }
      router.refresh();
    });
  }

  function handleDeclineSubmit(): void {
    const reason = declineReason.trim();
    if (!reason) {
      setError("Укажите причину отказа");
      return;
    }
    run(() => declineEstimate(estimateId, reason), { toast: "Отказ зафиксирован" });
  }

  async function handleDelete(): Promise<void> {
    const stageRu =
      { DRAFT: "черновик", SENT: "отправленную смету", DECLINED: "отклонённую смету", EXPIRED: "истёкшую смету", SUPERSEDED: "пересмотренную смету" }[stage] ?? "эту смету";
    const ok = await confirm({
      title: "Удалить смету",
      message: `Удалить ${stageRu}? Действие необратимо.`,
      danger: true,
      confirmText: "Удалить",
    });
    if (!ok) return;
    // After delete the estimate's own URL 404s. The server action returns
    // the parent dealId so we navigate directly — router.back() was unreliable
    // (depends on browser history; direct loads / refreshes had no prior page).
    setError(null);
    startTransition(async () => {
      const res = await deleteEstimate(estimateId);
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Смета удалена");
      if (res.dealId) {
        nav.push(`/admin/crm/deals/${res.dealId}`);
        router.refresh();
        return;
      }
      // Fallback (should never hit) — head to the deals list rather than 404.
      nav.push("/admin/crm/deals");
    });
  }

  return (
    <div className="space-y-2">
      {stage === "DRAFT" ? (
        <>
          <Button
            type="button"
            isLoading={pending}
            disabled={pending}
            onClick={() => run(() => sendEstimate(estimateId), { toast: "Смета отправлена клиенту" })}
          >
            Отправить клиенту
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => approveEstimate(estimateId), { toast: "Смета согласована" })}
          >
            Согласовать
          </Button>
        </>
      ) : null}

      {stage === "SENT" ? (
        <>
          <Button
            type="button"
            isLoading={pending}
            disabled={pending}
            onClick={() => run(() => approveEstimate(estimateId), { toast: "Согласие клиента зафиксировано" })}
          >
            Клиент согласен
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => setDeclineOpen((v) => !v)}
          >
            Клиент отказался
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => reviseEstimate(estimateId), { toast: "Создан новый черновик на основе текущей сметы" })}
          >
            Пересмотреть
          </Button>
        </>
      ) : null}

      {stage === "APPROVED" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => unapproveEstimate(estimateId), { toast: "Согласование откатано" })}
        >
          Откатить согласование
        </Button>
      ) : null}

      {declineOpen ? (
        <div className="card space-y-2">
          <Textarea
            label="Причина отказа"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            placeholder="Например: клиент не согласен с ценой работ"
          />
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDeclineOpen(false);
                setDeclineReason("");
              }}
              disabled={pending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              isLoading={pending}
              disabled={pending || declineReason.trim().length === 0}
              onClick={handleDeclineSubmit}
            >
              Подтвердить отказ
            </Button>
          </div>
        </div>
      ) : null}

      {/* Delete is offered for every non-APPROVED stage. APPROVED blocks at
          server level too — Unapprove + Delete is the path. */}
      {stage !== "APPROVED" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={handleDelete}
          className="text-[var(--color-error)]"
        >
          Удалить смету
        </Button>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}
