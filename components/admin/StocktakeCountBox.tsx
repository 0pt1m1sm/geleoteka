"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordCountByPartAction,
  recordCountAction,
  finalizeSessionAction,
} from "@/app/actions/stocktake";
import type { CountLine } from "@/lib/wms/public/stocktake";

type PartMap = Record<string, { name: string; article: string }>;

/** OPEN-session counting: pick a cell, enter counted qty per expected item
 *  (system qty shown — informed), add unexpected/unknown items, then finalize. */
export function StocktakeCountBox({
  sessionId,
  lines,
  partMap,
}: {
  sessionId: string;
  lines: CountLine[];
  partMap: PartMap;
}): React.ReactElement {
  const router = useRouter();
  const [cell, setCell] = useState("");
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [newCode, setNewCode] = useState("");
  const [newQty, setNewQty] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cells = [...new Set(lines.map((l) => l.location))].sort();
  const cellLines = activeCell ? lines.filter((l) => l.location === activeCell) : [];

  function openCell(code: string): void {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setActiveCell(c);
    setNote(null);
    setError(null);
  }

  function saveLine(line: CountLine): void {
    if (!line.itemId || !activeCell) return;
    const raw = counts[line.id] ?? String(line.countedQty ?? line.systemQty);
    const qty = parseInt(raw, 10);
    if (!Number.isInteger(qty) || qty < 0) {
      setError("Количество должно быть целым неотрицательным числом");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await recordCountByPartAction(sessionId, line.itemId!, activeCell, qty);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function addUnexpected(): void {
    if (!activeCell) return;
    const qty = parseInt(newQty, 10);
    if (!newCode.trim()) {
      setError("Отсканируйте или введите код позиции");
      return;
    }
    if (!Number.isInteger(qty) || qty < 0) {
      setError("Количество должно быть целым неотрицательным числом");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await recordCountAction(sessionId, newCode.trim(), activeCell, qty);
      if (res.error) {
        setError(res.error);
        return;
      }
      setNote(res.unknown ? `Код «${newCode.trim()}» не распознан — сохранён как неизвестный.` : null);
      setNewCode("");
      setNewQty("");
      router.refresh();
    });
  }

  function finalize(): void {
    setError(null);
    startTransition(async () => {
      const res = await finalizeSessionAction(sessionId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <section aria-label="Подсчёт" className="card space-y-4">
      <h2 className="text-lg font-semibold">Подсчёт</h2>
      {error && <p className="alert-error">{error}</p>}
      {note && <p className="alert-success">{note}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Ячейка</span>
          <input
            aria-label="Код ячейки"
            value={cell}
            onChange={(e) => setCell(e.target.value)}
            placeholder="A-1-1"
            className="input font-mono"
          />
        </label>
        <button type="button" onClick={() => openCell(cell)} className="btn btn-secondary min-h-[44px]">
          Открыть ячейку
        </button>
        {cells.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {cells.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => openCell(c)}
                className={`badge ${c === activeCell ? "bg-[var(--color-accent)] text-black" : ""}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeCell && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 space-y-3">
          <p className="font-mono text-sm">Ячейка {activeCell}</p>
          {cellLines.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">В системе нет позиций в этой ячейке.</p>
          ) : (
            <ul className="space-y-2">
              {cellLines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {l.itemId ? (partMap[l.itemId]?.name ?? "—") : `Неизвестно (${l.rawCode ?? ""})`}{" "}
                    <span className="font-mono text-xs text-[var(--foreground-muted)]">
                      {l.itemId ? partMap[l.itemId]?.article : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-[var(--foreground-muted)]">в системе: {l.systemQty}</span>
                    {l.itemId && (
                      <>
                        <input
                          type="number"
                          min={0}
                          aria-label={`Подсчитано ${partMap[l.itemId]?.article ?? l.itemId}`}
                          value={counts[l.id] ?? String(l.countedQty ?? l.systemQty)}
                          onChange={(e) => setCounts({ ...counts, [l.id]: e.target.value })}
                          className="input w-20"
                        />
                        <button
                          type="button"
                          onClick={() => saveLine(l)}
                          disabled={isPending}
                          className="btn btn-secondary btn-sm"
                        >
                          Сохранить
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Добавить позицию</span>
              <input
                aria-label="Код позиции"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Артикул / штрихкод / QR"
                className="input font-mono"
              />
            </label>
            <input
              type="number"
              min={0}
              aria-label="Количество позиции"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="Кол-во"
              className="input w-24"
            />
            <button type="button" onClick={addUnexpected} disabled={isPending} className="btn btn-secondary min-h-[44px]">
              Добавить
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={finalize} disabled={isPending} className="btn btn-primary min-h-[44px]">
        Завершить пересчёт
      </button>
    </section>
  );
}
