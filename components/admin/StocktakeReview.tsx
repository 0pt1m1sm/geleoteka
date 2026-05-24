"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  postCountSessionAction,
  cancelSessionAction,
  reopenSessionAction,
} from "@/app/actions/stocktake";
import type { CountLine, PartVariance, StockCountClassification } from "@/lib/wms/public/stocktake";

type PartMap = Record<string, { name: string; article: string }>;

const CLS_LABEL: Record<StockCountClassification, string> = {
  FOUND: "Найдено",
  MISSING: "Не найдено",
  UNEXPECTED: "Неучтённое",
  UNKNOWN: "Неизвестно",
};

/** REVIEW screen: per-part live projection + variance lines + post/cancel.
 *  In readOnly mode (POSTED/CANCELLED) it is a summary with no actions. */
export function StocktakeReview({
  sessionId,
  lines,
  variance,
  partMap,
  canPost,
  readOnly = false,
}: {
  sessionId: string;
  lines: CountLine[];
  variance: PartVariance[];
  partMap: PartMap;
  canPost: boolean;
  readOnly?: boolean;
}): React.ReactElement {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [driftCells, setDriftCells] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const name = (id: string | null): string => (id ? (partMap[id]?.name ?? "—") : "—");
  const article = (id: string | null): string => (id ? (partMap[id]?.article ?? "") : "");

  function post(): void {
    setError(null);
    setDriftCells([]);
    startTransition(async () => {
      const res = await postCountSessionAction(sessionId);
      if (!res.error) {
        router.refresh();
        return;
      }
      setError(res.error);
      if (res.drift) setDriftCells(res.drift.map((d) => d.location));
    });
  }

  function reopen(): void {
    setError(null);
    startTransition(async () => {
      const res = await reopenSessionAction(sessionId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function cancel(): void {
    setError(null);
    startTransition(async () => {
      const res = await cancelSessionAction(sessionId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const postable = lines.filter((l) => l.classification && l.classification !== "UNKNOWN");
  const unknownLines = lines.filter((l) => l.classification === "UNKNOWN");

  return (
    <section aria-label="Проверка" className="card space-y-4">
      <h2 className="text-lg font-semibold">Проверка и проводка</h2>
      {error && <p className="alert-error">{error}</p>}
      {driftCells.length > 0 && (
        <p className="alert-error">
          Изменились ячейки: <span className="font-mono">{[...new Set(driftCells)].join(", ")}</span>. Пересчитайте их.
        </p>
      )}

      {/* Per-part projection (live state) */}
      {variance.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Влияние на остаток (по позициям)</h3>
          <ul className="space-y-1 text-sm">
            {variance.map((v) => (
              <li key={v.itemId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {name(v.itemId)} <span className="font-mono text-xs text-[var(--foreground-muted)]">{article(v.itemId)}</span>
                  {v.reconcileNeeded && (
                    <span className="badge ml-2 bg-[var(--color-error-bg)] text-[var(--color-error)]">рассогласование</span>
                  )}
                </span>
                <span className="text-xs tabular-nums">
                  остаток {v.onHandBefore}→{v.onHandAfter} · без места {v.unplacedBefore}→{v.unplacedAfter} ·{" "}
                  {v.netAdjustment >= 0 ? `+${v.netAdjustment}` : v.netAdjustment}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Variance lines by classification */}
      <div>
        <h3 className="text-sm font-medium mb-2">Позиции пересчёта</h3>
        {postable.length === 0 && unknownLines.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">Нет данных пересчёта.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {postable.map((l) => {
              const delta = (l.countedQty ?? 0) - l.systemQty;
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="badge mr-2">{CLS_LABEL[l.classification!]}</span>
                    {name(l.itemId)} <span className="font-mono text-xs text-[var(--foreground-muted)]">{article(l.itemId)}</span>
                    <span className="font-mono text-xs text-[var(--foreground-muted)]"> @ {l.location}</span>
                  </span>
                  <span className="text-xs tabular-nums">
                    {l.systemQty} → {l.countedQty ?? 0}{" "}
                    <span className={delta === 0 ? "text-[var(--foreground-muted)]" : ""}>
                      ({delta >= 0 ? `+${delta}` : delta})
                    </span>
                  </span>
                </li>
              );
            })}
            {unknownLines.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="badge mr-2">{CLS_LABEL.UNKNOWN}</span>
                  <span className="font-mono text-xs">{l.rawCode ?? ""}</span>
                  <span className="font-mono text-xs text-[var(--foreground-muted)]"> @ {l.location}</span>
                </span>
                <span className="text-xs text-[var(--foreground-muted)]">не проводится</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {canPost && (
            <button type="button" onClick={post} disabled={isPending} className="btn btn-primary min-h-[44px]">
              Провести
            </button>
          )}
          <button type="button" onClick={reopen} disabled={isPending} className="btn btn-secondary min-h-[44px]">
            Вернуться к подсчёту
          </button>
          <button type="button" onClick={cancel} disabled={isPending} className="btn btn-secondary min-h-[44px]">
            Отменить
          </button>
        </div>
      )}
    </section>
  );
}
