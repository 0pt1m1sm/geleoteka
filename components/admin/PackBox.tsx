"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { packOrderLine, recordPackBoxScan, shipPackedOrder } from "@/app/actions/packing";
import type { OpenPackLine } from "@/lib/warehouse/pack";

/** Pack flow for one order: scan a parcel (box), then per open line scan a bin +
 *  the part to pick the FULL required quantity (server-derived, bin-aware). When
 *  no open lines remain, confirm shipment (PROCESSING → SHIPPED). WRONG_ITEM /
 *  INSUFFICIENT_BIN surface as an inline alert. */
export function PackBox({
  orderId,
  lines,
}: {
  orderId: string;
  lines: OpenPackLine[];
}): React.ReactElement {
  // useRouter only for .refresh() (re-fetch the server-rendered open list); we
  // never .push here. Named to avoid the banned `router.push` pattern.
  const refreshRouter = useRouter();
  const [box, setBox] = useState("");
  const [boxConfirmed, setBoxConfirmed] = useState<string | null>(null);
  const [bin, setBin] = useState<Record<string, string>>({});
  const [part, setPart] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isShipPending, startShipTransition] = useTransition();
  const [isBoxPending, startBoxTransition] = useTransition();

  function confirmBox(): void {
    const code = box.trim();
    if (!code) {
      setError("Отсканируйте короб");
      setSuccess(null);
      return;
    }
    setError(null);
    startBoxTransition(async () => {
      const res = await recordPackBoxScan(orderId, code);
      if (res.error) {
        setError(res.error);
        return;
      }
      setBoxConfirmed(code);
      setSuccess(`Короб принят: ${code}`);
    });
  }

  function pack(line: OpenPackLine): void {
    const binCode = (bin[line.lineKey] ?? "").trim();
    const partCode = (part[line.lineKey] ?? "").trim();
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
    setActiveLine(line.lineKey);
    startTransition(async () => {
      const res = await packOrderLine(orderId, line.lineKey, partCode, binCode);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSuccess(`Упаковано: ${line.name} × ${res.requiredQty ?? line.requiredQty}`);
      setActiveLine(null);
      refreshRouter.refresh();
    });
  }

  function ship(): void {
    setError(null);
    setSuccess(null);
    startShipTransition(async () => {
      const res = await shipPackedOrder(orderId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSuccess("Заказ отправлен");
      refreshRouter.refresh();
    });
  }

  return (
    <section aria-label="Упаковка" className="card space-y-4">
      <h2 className="text-lg font-semibold">Упаковка</h2>
      {error && <p className="alert-error">{error}</p>}
      {success && <p className="alert-success">{success}</p>}

      {/* Parcel (box) scan — single-box, audit-only */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Короб</span>
          <input
            aria-label="Короб"
            value={box}
            onChange={(e) => setBox(e.target.value)}
            placeholder="BOX / QR"
            className="input font-mono"
          />
        </label>
        <button
          type="button"
          onClick={confirmBox}
          disabled={isBoxPending}
          className="btn btn-secondary min-h-[44px]"
        >
          Подтвердить короб
        </button>
        {boxConfirmed && <span className="badge font-mono">{boxConfirmed}</span>}
      </div>

      {lines.length === 0 ? (
        <p className="alert-success">Все позиции этого заказа упакованы.</p>
      ) : (
        <ul className="space-y-3">
          {lines.map((line) => (
            <li
              key={line.lineKey}
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
                      onClick={() => setBin({ ...bin, [line.lineKey]: b.location })}
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
                    value={bin[line.lineKey] ?? ""}
                    onChange={(e) => setBin({ ...bin, [line.lineKey]: e.target.value })}
                    placeholder="A-1-1"
                    className="input font-mono"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Запчасть</span>
                  <input
                    aria-label={`Запчасть для ${line.article}`}
                    value={part[line.lineKey] ?? ""}
                    onChange={(e) => setPart({ ...part, [line.lineKey]: e.target.value })}
                    placeholder="Артикул / штрихкод / QR"
                    className="input font-mono"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => pack(line)}
                  disabled={isPending && activeLine === line.lineKey}
                  className="btn btn-primary min-h-[44px]"
                >
                  Упаковать
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={ship}
          disabled={lines.length > 0 || isShipPending}
          className="btn btn-primary min-h-[44px]"
        >
          {isShipPending ? "Отправка..." : "Подтвердить отгрузку"}
        </button>
        {lines.length > 0 && (
          <p className="mt-2 text-xs text-[var(--foreground-muted)]">
            Отгрузка доступна после упаковки всех позиций.
          </p>
        )}
      </div>
    </section>
  );
}
