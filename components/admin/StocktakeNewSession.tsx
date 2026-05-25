"use client";

import { useState, useTransition } from "react";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { createCountSessionAction } from "@/app/actions/stocktake";
import type { StockCountScope } from "@/lib/wms/public/stocktake";

const SCOPE_OPTIONS: Array<{ value: StockCountScope; label: string; hint: string }> = [
  { value: "ZONE", label: "Зона", hint: "Например: A" },
  { value: "LOCATION", label: "Ячейки", hint: "Коды через запятую, напр. A-1-1, A-1-2" },
  { value: "FULL", label: "Весь склад", hint: "" },
  { value: "PART", label: "Позиции / категория", hint: "Slug категории или артикулы через запятую" },
];

/** Start a new count session: pick a scope, give its value, and go to the session. */
export function StocktakeNewSession({ warehouseId }: { warehouseId?: string }): React.ReactElement {
  const nav = useProgressRouter();
  const [scope, setScope] = useState<StockCountScope>("ZONE");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const needsValue = scope !== "FULL";
  const hint = SCOPE_OPTIONS.find((o) => o.value === scope)?.hint ?? "";

  function submit(): void {
    setError(null);
    startTransition(async () => {
      const res = await createCountSessionAction(scope, needsValue ? value : "", warehouseId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.sessionId) nav.push(`/admin/warehouse/stocktake/${res.sessionId}`);
    });
  }

  return (
    <section aria-label="Новый пересчёт" className="card">
      <h2 className="text-lg font-semibold mb-3">Новый пересчёт</h2>
      {error && <p className="alert-error mb-3">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Охват</span>
          <select
            aria-label="Охват пересчёта"
            value={scope}
            onChange={(e) => setScope(e.target.value as StockCountScope)}
            className="input"
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {needsValue && (
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Значение</span>
            <input
              aria-label="Значение охвата"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={hint}
              className="input font-mono"
            />
          </label>
        )}
        <button type="button" onClick={submit} disabled={isPending} className="btn btn-primary min-h-[44px]">
          {isPending ? "Создание…" : "Создать"}
        </button>
      </div>
    </section>
  );
}
