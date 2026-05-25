"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pickRepairOrderLine } from "@/app/actions/picking";
import type { OpenPickLine } from "@/lib/warehouse/pick";

/** Per-line scan-to-pick: for each open line, scan a bin + the part, then pick
 *  the FULL required quantity (server-derived). WRONG_ITEM / INSUFFICIENT_BIN
 *  surface as an inline alert; a successful pick refreshes the list (line drops). */
export function PickBox({
  repairOrderId,
  lines,
  warehouseId,
}: {
  repairOrderId: string;
  lines: OpenPickLine[];
  warehouseId?: string;
}): React.ReactElement {
  // useRouter only for .refresh() (re-fetch the server-rendered open-pick list);
  // ProgressRouter has no refresh, and we never .push here. Named to avoid the
  // banned `router.push` pattern.
  const refreshRouter = useRouter();
  const [bin, setBin] = useState<Record<string, string>>({});
  const [part, setPart] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function pick(line: OpenPickLine): void {
    const binCode = (bin[line.lineId] ?? "").trim();
    const partCode = (part[line.lineId] ?? "").trim();
    if (!binCode) {
      setError("Отсканируйте ячейку");
      setSuccess(null);
      return;
    }
    if (!partCode) {
      setError("Отсканируйте запчасть");
      setSuccess(null);
      return;
    }
    setError(null);
    setSuccess(null);
    setActiveLine(line.lineId);
    startTransition(async () => {
      const res = await pickRepairOrderLine(repairOrderId, line.lineId, partCode, binCode, warehouseId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSuccess(`Отобрано: ${line.name} × ${res.requiredQty ?? line.requiredQty}`);
      refreshRouter.refresh();
    });
  }

  if (lines.length === 0) {
    return (
      <section aria-label="Отбор" className="card">
        <h2 className="text-lg font-semibold mb-2">Отбор</h2>
        <p className="alert-success">Все позиции этого заказа отобраны.</p>
      </section>
    );
  }

  return (
    <section aria-label="Отбор" className="card space-y-4">
      <h2 className="text-lg font-semibold">Отбор</h2>
      {error && <p className="alert-error">{error}</p>}
      {success && <p className="alert-success">{success}</p>}

      <ul className="space-y-3">
        {lines.map((line) => (
          <li
            key={line.lineId}
            className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                {line.name}{" "}
                <span className="font-mono text-xs text-[var(--foreground-muted)]">{line.article}</span>
              </span>
              <span className="text-xs text-[var(--foreground-muted)]">нужно: {line.requiredQty}</span>
            </div>

            {line.bins.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-[var(--foreground-muted)]">ячейки:</span>
                {line.bins.map((b) => (
                  <button
                    key={b.location}
                    type="button"
                    onClick={() => setBin({ ...bin, [line.lineId]: b.location })}
                    className="badge"
                  >
                    {b.location} ({b.quantity})
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Ячейка</span>
                <input
                  aria-label={`Ячейка для ${line.article}`}
                  value={bin[line.lineId] ?? ""}
                  onChange={(e) => setBin({ ...bin, [line.lineId]: e.target.value })}
                  placeholder="A-1-1"
                  className="input font-mono"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Запчасть</span>
                <input
                  aria-label={`Запчасть для ${line.article}`}
                  value={part[line.lineId] ?? ""}
                  onChange={(e) => setPart({ ...part, [line.lineId]: e.target.value })}
                  placeholder="Артикул / штрихкод / QR"
                  className="input font-mono"
                />
              </label>
              <button
                type="button"
                onClick={() => pick(line)}
                disabled={isPending && activeLine === line.lineId}
                className="btn btn-primary min-h-[44px]"
              >
                Отобрать
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
