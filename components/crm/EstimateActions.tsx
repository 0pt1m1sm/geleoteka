"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import {
  approveEstimate,
  declineEstimate,
  reviseEstimate,
  sendEstimate,
} from "@/app/actions/crm/estimates";

interface Props {
  estimateId: string;
  stage: string;
}

/**
 * Stage-transition buttons for a single Estimate. Layout depends on the
 * current stage: DRAFT shows Send, SENT shows Approve / Decline /
 * Revise, terminal stages (APPROVED / DECLINED / EXPIRED / SUPERSEDED)
 * show no actions (history only).
 */
export function EstimateActions({
  estimateId,
  stage,
}: Props): React.ReactElement | null {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error: string | null; estimateId?: string }>): void {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        setError(res.error);
        return;
      }
      // Revision creates a child estimate; navigate there.
      if (res.estimateId && res.estimateId !== estimateId) {
        router.push(`/admin/crm/estimates/${res.estimateId}`);
        return;
      }
      router.refresh();
    });
  }

  function handleDecline(): void {
    const reason = prompt("Причина отказа клиента:");
    if (!reason || !reason.trim()) return;
    run(() => declineEstimate(estimateId, reason));
  }

  if (stage === "DRAFT") {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          isLoading={pending}
          disabled={pending}
          onClick={() => run(() => sendEstimate(estimateId))}
        >
          Отправить клиенту
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => approveEstimate(estimateId))}
        >
          Согласовать
        </Button>
        {error ? <Alert variant="error">{error}</Alert> : null}
      </div>
    );
  }

  if (stage === "SENT") {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          isLoading={pending}
          disabled={pending}
          onClick={() => run(() => approveEstimate(estimateId))}
        >
          Клиент согласен
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={handleDecline}
        >
          Клиент отказался
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => reviseEstimate(estimateId))}
        >
          Пересмотреть
        </Button>
        {error ? <Alert variant="error">{error}</Alert> : null}
      </div>
    );
  }

  return null;
}
