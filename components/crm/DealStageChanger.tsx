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

  /**
   * Two steps, because the answer differs by case. The first attempt deletes a
   * deal that produced nothing. If the server reports fulfillment, the operator
   * is told exactly what would go and asked again — deleting a wrongly-entered
   * deal is legitimate and often faster than fixing every field, so this is a
   * confirmation rather than a refusal.
   *
   * The old copy here said "история работ сохранится", which was false: the
   * schema cascades, so the repair order and its work went with the deal.
   */
  async function handleDelete(): Promise<void> {
    const ok = await confirm({
      title: "Удалить сделку",
      message:
        "Удалить сделку безвозвратно? Сметы будут удалены. Запчасти, забронированные под " +
        "эту сделку, вернутся на склад — кроме уже установленных или отгруженных: они списаны " +
        "и на складе их нет.",
      danger: true,
      confirmText: "Удалить",
    });
    if (!ok) return;

    startTransition(async () => {
      setError(null);
      const result = await deleteDeal(dealId);

      if (result.error) {
        // Only the fulfillment guard is re-askable; anything else is final.
        if (!result.error.includes("исполнение")) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        const force = await confirm({
          title: "По сделке есть работы",
          message: `${result.error}\n\nУдалить вместе с заказ-нарядами, работами и фотографиями?`,
          danger: true,
          confirmText: "Удалить всё",
        });
        if (!force) return;

        const forced = await deleteDeal(dealId, { deleteFulfillment: true });
        if (forced.error) {
          setError(forced.error);
          toast.error(forced.error);
          return;
        }
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
