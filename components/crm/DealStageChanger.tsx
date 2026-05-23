"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { Alert } from "@/components/ui";
import { setDealStage, deleteDeal } from "@/app/actions/crm/deals";
import { DEAL_STAGE_LABELS } from "@/lib/deal-stage-labels";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

const STAGES = ["NEW", "IN_PROGRESS", "WON", "LOST"];

export function DealStageChanger({
  dealId,
  currentStage,
}: {
  dealId: string;
  currentStage: string;
}): React.ReactElement {
  const router = useRouter();
  const nav = useProgressRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const next = e.target.value;
    if (next === currentStage) return;
    startTransition(async () => {
      setError(null);
      let lostReason: string | undefined;
      if (next === "LOST") {
        const reason = prompt("Причина проигрыша сделки:") ?? undefined;
        if (!reason || !reason.trim()) {
          router.refresh();
          return;
        }
        lostReason = reason.trim();
      }
      const result = await setDealStage(dealId, next, lostReason);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(`Стадия: ${DEAL_STAGE_LABELS[next] ?? next}`);
      router.refresh();
    });
  }

  async function handleDelete(): Promise<void> {
    const ok = await confirm({
      title: "Удалить сделку",
      message: "Удалить сделку безвозвратно? Сметы будут удалены, история работ сохранится.",
      danger: true,
      confirmText: "Удалить",
    });
    if (!ok) return;
    startTransition(async () => {
      setError(null);
      const result = await deleteDeal(dealId);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Сделка удалена");
      nav.push("/admin/crm/deals");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <select
        value={currentStage}
        onChange={handleChange}
        disabled={pending}
        className="input text-sm py-2"
        aria-label="Стадия сделки"
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {DEAL_STAGE_LABELS[s] ?? s}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="btn btn-secondary text-xs w-full"
      >
        Удалить сделку
      </button>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}
