"use client";

import { useMemo, useState } from "react";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { Button } from "@/components/ui";
import type { ReorderReportRow } from "@/lib/warehouse/replenishment";

/** Replenishment report: items at/below their reorder point. The manager picks
 *  rows + quantities and hands them to the supplier-order form pre-filled. */
export function ReplenishmentReport({ rows }: { rows: ReorderReportRow[] }): React.ReactElement {
  const nav = useProgressRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.map((r) => r.partId)));
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((r) => [r.partId, r.suggestedQty])),
  );

  const selectedCount = useMemo(
    () => rows.filter((r) => selected.has(r.partId) && (qty[r.partId] ?? 0) > 0).length,
    [rows, selected, qty],
  );

  function toggle(partId: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  }

  function createDraft(): void {
    const prefill = rows
      .filter((r) => selected.has(r.partId) && (qty[r.partId] ?? 0) > 0)
      .map((r) => `${r.partId}:${qty[r.partId]}`)
      .join(",");
    if (!prefill) return;
    nav.push(`/admin/suppliers/orders/new?prefill=${encodeURIComponent(prefill)}`);
  }

  if (rows.length === 0) {
    return (
      <section aria-label="Дозаказ" className="card text-center py-12 text-[var(--foreground-muted)]">
        Нет позиций к дозаказу — все остатки выше точек дозаказа.
      </section>
    );
  }

  return (
    <section aria-label="Дозаказ" className="space-y-4">
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--foreground-muted)]">
              <th className="p-3 font-medium w-10"></th>
              <th className="p-3 font-medium">Название</th>
              <th className="p-3 font-medium">Артикул</th>
              <th className="p-3 font-medium text-right">Доступно</th>
              <th className="p-3 font-medium text-right">Ожидается</th>
              <th className="p-3 font-medium text-right">Точка</th>
              <th className="p-3 font-medium text-right">До</th>
              <th className="p-3 font-medium text-right">Заказать</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.partId} className="border-b border-[var(--border)] last:border-0">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(r.partId)}
                    onChange={() => toggle(r.partId)}
                    aria-label={`Выбрать ${r.name}`}
                  />
                </td>
                <td className="p-3">{r.name}</td>
                <td className="p-3 font-mono text-xs">{r.article}</td>
                <td className="p-3 text-right">{r.available}</td>
                <td className="p-3 text-right">
                  {r.incoming > 0 ? (
                    <span className="text-[var(--color-info)]">+{r.incoming}</span>
                  ) : (
                    <span className="text-[var(--foreground-muted)]">—</span>
                  )}
                </td>
                <td className="p-3 text-right text-[var(--foreground-muted)]">{r.reorderPoint}</td>
                <td className="p-3 text-right text-[var(--foreground-muted)]">{r.reorderUpTo}</td>
                <td className="p-3 text-right">
                  <input
                    type="number"
                    min={1}
                    value={qty[r.partId] ?? r.suggestedQty}
                    onChange={(e) =>
                      setQty((prev) => ({ ...prev, [r.partId]: Math.max(0, parseInt(e.target.value, 10) || 0) }))
                    }
                    aria-label={`Количество к заказу ${r.name}`}
                    className="input w-20 text-right"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-[var(--foreground-muted)]">Выбрано позиций: {selectedCount}</span>
        <Button type="button" variant="primary" disabled={selectedCount === 0} onClick={createDraft}>
          Создать черновик заказа
        </Button>
      </div>
    </section>
  );
}
