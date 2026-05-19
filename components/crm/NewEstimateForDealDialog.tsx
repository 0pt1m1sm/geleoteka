"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import { openOrCreateActiveEstimate } from "@/app/actions/crm/estimates";
import {
  DEAL_CHANNEL_LABELS,
  DEAL_STAGE_LABELS,
} from "@/lib/deal-stage-labels";
import { formatPrice } from "@/lib/utils";

interface DealOption {
  id: string;
  number: string | null;
  stage: string;
  channel: string;
  total: number;
  customer: { id: string; name: string };
  vehicle: { make: string; model: string } | null;
}

interface Props {
  deals: DealOption[];
}

/**
 * "Смета к сделке" dialog — primary path for creating an estimate on the
 * /admin/crm/estimates page. Manager picks an existing open deal; the
 * action opens its current DRAFT, or revises the latest non-SUPERSEDED
 * estimate into a new DRAFT, or starts a blank DRAFT — whichever is
 * appropriate. Then redirects into the estimate editor.
 *
 * For manager-initiated deals (walk-in, phone-lead with no existing deal)
 * the page also renders the standalone NewDealDialog alongside this one.
 */
export function NewEstimateForDealDialog({ deals }: Props): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [pickedDealId, setPickedDealId] = useState<string>("");
  const [state, formAction, isPending] = useActionState(openOrCreateActiveEstimate, null);

  // React to the useActionState result: close the dialog and navigate to
  // the freshly opened/created estimate. The setState is gated on the
  // action's success signal — not a cascading render, just the standard
  // "deferred reaction to an async result" pattern useActionState forces
  // (the action runs outside React's render and the result only arrives
  // via state update).
  useEffect(() => {
    if (state?.estimateId && !state?.error && !isPending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      router.push(`/admin/crm/estimates/${state.estimateId}`);
    }
  }, [state, isPending, router]);

  const trimmed = filter.trim().toLowerCase();
  const filtered = trimmed
    ? deals.filter((d) => {
        const haystack = `${d.customer.name} ${d.number ?? ""} ${
          d.vehicle ? `${d.vehicle.make} ${d.vehicle.model}` : ""
        }`.toLowerCase();
        return haystack.includes(trimmed);
      })
    : deals;

  function reset(): void {
    setFilter("");
    setPickedDealId("");
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        leftIcon={<Plus size={14} />}
        onClick={() => setOpen(true)}
      >
        Смета к сделке
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Смета к существующей сделке</DialogTitle>
          </DialogHeader>

          {deals.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)] py-4">
              Открытых сделок нет. Создайте новую сделку.
            </p>
          ) : (
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="dealId" value={pickedDealId} />

              <Input
                label="Поиск"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Имя клиента, номер сделки, авто"
                autoFocus
              />

              <ul className="max-h-72 overflow-y-auto border border-[var(--border)] rounded-[var(--radius-lg)] divide-y divide-[var(--border)]">
                {filtered.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-[var(--foreground-muted)]">
                    Ничего не найдено
                  </li>
                ) : (
                  filtered.map((d) => {
                    const selected = pickedDealId === d.id;
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => setPickedDealId(d.id)}
                          className={`w-full text-left px-3 py-2 transition-colors ${
                            selected
                              ? "bg-[var(--color-accent)]/10 border-l-2 border-[var(--color-accent)]"
                              : "hover:bg-[var(--card-hover)] active:bg-[var(--card-hover)]"
                          }`}
                          aria-pressed={selected}
                        >
                          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                            <span>{d.customer.name}</span>
                            {d.vehicle ? (
                              <span className="text-[var(--foreground-muted)] font-normal">
                                · {d.vehicle.make} {d.vehicle.model}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-[var(--foreground-muted)] mt-0.5 flex flex-wrap gap-x-3">
                            <span>{d.number ?? "—"}</span>
                            <span>{DEAL_STAGE_LABELS[d.stage] ?? d.stage}</span>
                            <span>{DEAL_CHANNEL_LABELS[d.channel] ?? d.channel}</span>
                            {d.total > 0 ? (
                              <span className="text-[var(--color-accent)]">
                                {formatPrice(d.total)}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>

              {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

              <DialogFooter className="mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  isLoading={isPending}
                  disabled={isPending || !pickedDealId}
                  title={!pickedDealId ? "Выберите сделку" : undefined}
                >
                  Открыть смету
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
