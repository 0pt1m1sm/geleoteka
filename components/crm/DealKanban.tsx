"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { setDealStage } from "@/app/actions/crm/deals";
import { DEAL_STAGE_LABELS, DEAL_CHANNEL_LABELS } from "@/lib/deal-stage-labels";
import { formatPrice } from "@/lib/utils";
import { toast } from "@/lib/ui/toast";

export interface KanbanDeal {
  id: string;
  number: string | null;
  stage: string;
  channel: string;
  total: number;
  customerName: string;
  vehicle: string | null;
  openTasks: number;
}

const STAGES = ["NEW", "IN_PROGRESS", "WON", "LOST"] as const;

export function DealKanban({ deals }: { deals: KanbanDeal[] }): React.ReactElement {
  const router = useRouter();
  const [items, setItems] = useState<KanbanDeal[]>(deals);
  const [, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);

  function move(dealId: string, toStage: string): void {
    const cur = items.find((d) => d.id === dealId);
    if (!cur || cur.stage === toStage) return;
    const prevStage = cur.stage;
    // Optimistic move.
    setItems((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: toStage } : d)));
    startTransition(async () => {
      const res = await setDealStage(dealId, toStage);
      if (res.error) {
        // Revert on a rejected transition (FORWARD_FROM policy / permissions).
        setItems((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: prevStage } : d)));
        toast.error(res.error);
        return;
      }
      toast.success("Стадия обновлена");
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {STAGES.map((stage) => {
        const column = items.filter((d) => d.stage === stage);
        return (
          <div
            key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) move(dragId, stage);
              setDragId(null);
            }}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background-secondary)] p-2 min-h-32"
          >
            <div className="flex items-center justify-between px-1 py-2 mb-1">
              <span className="text-sm font-medium">{DEAL_STAGE_LABELS[stage] ?? stage}</span>
              <span className="text-xs text-[var(--foreground-muted)] tabular-nums">{column.length}</span>
            </div>
            <ul className="space-y-2">
              {column.map((d) => (
                <li
                  key={d.id}
                  draggable
                  onDragStart={() => setDragId(d.id)}
                  onDragEnd={() => setDragId(null)}
                  className="card p-3 cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/crm/deals/${d.id}`} className="font-medium text-sm truncate hover:underline">
                      {d.customerName}
                    </Link>
                    <span className="text-sm font-bold text-[var(--color-accent)] tabular-nums shrink-0">
                      {formatPrice(d.total)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--foreground-muted)] flex flex-wrap gap-x-2 items-center">
                    <span>{d.number ?? "—"}</span>
                    <span>{DEAL_CHANNEL_LABELS[d.channel] ?? d.channel}</span>
                    {d.vehicle ? <span>{d.vehicle}</span> : null}
                    {d.openTasks > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <ListChecks size={11} aria-hidden />
                        {d.openTasks}
                      </span>
                    ) : null}
                  </div>
                  {/* Keyboard / non-drag fallback. */}
                  <label className="sr-only" htmlFor={`stage-${d.id}`}>
                    Стадия сделки {d.customerName}
                  </label>
                  <select
                    id={`stage-${d.id}`}
                    value={d.stage}
                    onChange={(e) => move(d.id, e.target.value)}
                    className="input mt-2 w-full text-xs py-1"
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {DEAL_STAGE_LABELS[s] ?? s}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
