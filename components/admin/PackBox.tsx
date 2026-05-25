"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { packOrderLine, recordPackBoxScan, shipPackedOrder } from "@/app/actions/packing";
import { QrScanner } from "@/components/warehouse/QrScanner";
import type { OpenPackLine } from "@/lib/warehouse/pack";

/** Which scan panel is open. A single union makes it structurally impossible to
 *  mount two QrScanners (two camera streams) at once — the короб panel and any
 *  line panel are mutually exclusive by construction. */
type ScanTarget = { kind: "box" } | { kind: "line"; key: string } | null;

/** Pack flow for one order: scan a parcel (box), then per open line scan a bin +
 *  the part to pick the FULL required quantity (server-derived, bin-aware). When
 *  no open lines remain, confirm shipment (PROCESSING → SHIPPED). WRONG_ITEM /
 *  INSUFFICIENT_BIN surface as an inline alert. */
export function PackBox({
  orderId,
  lines,
  warehouseId,
}: {
  orderId: string;
  lines: OpenPackLine[];
  warehouseId?: string;
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
  // Camera scan. One union target → only one QrScanner ever mounts. Per-line
  // sequencing uses refs because QrScanner's decode callback closes over a
  // stale onScan (registered once at camera-start); refs stay current.
  const [scanTarget, setScanTarget] = useState<ScanTarget>(null);
  const [scanStep, setScanStep] = useState<"bin" | "part">("bin");
  const scanStepRef = useRef<"bin" | "part">("bin");
  const lastCodeRef = useRef<string>("");

  function openScanner(lineKey: string): void {
    // Safe to read bin state directly here: this runs in a click handler, not
    // inside QrScanner's stale decode callback (see handleLineScan).
    const step = (bin[lineKey] ?? "").trim() ? "part" : "bin";
    scanStepRef.current = step;
    lastCodeRef.current = "";
    setScanStep(step);
    setScanTarget({ kind: "line", key: lineKey });
  }

  function handleLineScan(lineKey: string, raw: string): void {
    const code = raw.trim();
    if (!code) return;
    if (scanStepRef.current === "bin") {
      setBin((m) => ({ ...m, [lineKey]: code }));
      lastCodeRef.current = code;
      scanStepRef.current = "part";
      setScanStep("part");
    } else {
      // Ignore the still-framed bin code so it cannot bleed into the part field.
      if (code === lastCodeRef.current) return;
      setPart((m) => ({ ...m, [lineKey]: code }));
      setScanTarget(null);
    }
  }

  function handleBoxScan(raw: string): void {
    const code = raw.trim();
    if (!code) return;
    setBox(code);
    setScanTarget(null);
  }

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
      const res = await packOrderLine(orderId, line.lineKey, partCode, binCode, warehouseId);
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
        <button
          type="button"
          onClick={() => setScanTarget({ kind: "box" })}
          aria-label="Сканировать короб камерой"
          className="btn btn-secondary min-h-[44px]"
        >
          Сканировать камерой
        </button>
        {boxConfirmed && <span className="badge font-mono">{boxConfirmed}</span>}
      </div>

      {scanTarget?.kind === "box" && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 space-y-2">
          <p className="text-xs font-medium text-[var(--foreground-muted)]">Наведите на код короба</p>
          <QrScanner onScan={handleBoxScan} />
          <button type="button" onClick={() => setScanTarget(null)} className="btn btn-secondary btn-sm">
            Отмена
          </button>
        </div>
      )}

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

              <div>
                <button
                  type="button"
                  onClick={() => openScanner(line.lineKey)}
                  aria-label={`Сканировать камерой для ${line.article}`}
                  className="btn btn-secondary min-h-[44px]"
                >
                  Сканировать камерой
                </button>
                {scanTarget?.kind === "line" && scanTarget.key === line.lineKey && (
                  <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3 space-y-2">
                    <p className="text-xs font-medium text-[var(--foreground-muted)]">
                      {scanStep === "bin" ? "Шаг 1/2: наведите на ячейку" : "Шаг 2/2: наведите на запчасть"}
                    </p>
                    <QrScanner onScan={(raw) => handleLineScan(line.lineKey, raw)} />
                    <button type="button" onClick={() => setScanTarget(null)} className="btn btn-secondary btn-sm">
                      Отмена
                    </button>
                  </div>
                )}
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
