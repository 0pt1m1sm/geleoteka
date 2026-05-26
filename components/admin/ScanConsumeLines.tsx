"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QrScanner } from "@/components/warehouse/QrScanner";
import type { OpenConsumeLine } from "@/lib/warehouse/scan-consume";

export interface ScanConsumeResult {
  error: string | null;
  requiredQty?: number;
}

/**
 * Shared per-line scan-to-consume list for both pick (отбор) and pack (упаковка):
 * for each open line, scan a bin + the part (manually or via the 2-step camera),
 * then consume the FULL required quantity (server-derived). The two flows differ
 * only in labels and the consume action — passed via props.
 *
 * The open-scanner key is LIFTED to the parent (`openScanKey`/`onOpenScanKey`) so
 * a pack parent can keep its parcel-box scanner mutually exclusive with the line
 * scanners (only one camera stream ever mounts). Alerts are lifted too
 * (`setError`/`setSuccess`) so the parent shows a single alert area shared with
 * its box/ship messages.
 */
export function ScanConsumeLines({
  lines,
  actionLabel,
  successVerb,
  emptyMessage,
  onConsume,
  openScanKey,
  onOpenScanKey,
  setError,
  setSuccess,
}: {
  lines: OpenConsumeLine[];
  actionLabel: string;
  successVerb: string;
  emptyMessage: string;
  onConsume: (lineKey: string, partCode: string, binCode: string) => Promise<ScanConsumeResult>;
  openScanKey: string | null;
  onOpenScanKey: (key: string | null) => void;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
}): React.ReactElement {
  // useRouter only for .refresh() (re-fetch the server-rendered open list); we
  // never .push here. Named to avoid the banned `router.push` pattern.
  const refreshRouter = useRouter();
  const [bin, setBin] = useState<Record<string, string>>({});
  const [part, setPart] = useState<Record<string, string>>({});
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Camera sequencing uses refs because QrScanner's decode callback closes over a
  // stale onScan (registered once at camera-start); refs stay current.
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
    onOpenScanKey(lineKey);
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
      // Bin label may still be framed after QrScanner's 1 s dup-guard expires —
      // ignore the bin code so it cannot bleed into the part field.
      if (code === lastCodeRef.current) return;
      setPart((m) => ({ ...m, [lineKey]: code }));
      onOpenScanKey(null);
    }
  }

  function consume(line: OpenConsumeLine): void {
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
      const res = await onConsume(line.lineKey, partCode, binCode);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSuccess(`${successVerb}: ${line.name} × ${res.requiredQty ?? line.requiredQty}`);
      setActiveLine(null);
      refreshRouter.refresh();
    });
  }

  if (lines.length === 0) {
    return <p className="alert-success">{emptyMessage}</p>;
  }

  return (
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
              onClick={() => consume(line)}
              disabled={isPending && activeLine === line.lineKey}
              className="btn btn-primary min-h-[44px]"
            >
              {actionLabel}
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
            {openScanKey === line.lineKey && (
              <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3 space-y-2">
                <p className="text-xs font-medium text-[var(--foreground-muted)]">
                  {scanStep === "bin" ? "Шаг 1/2: наведите на ячейку" : "Шаг 2/2: наведите на запчасть"}
                </p>
                <QrScanner onScan={(raw) => handleLineScan(line.lineKey, raw)} />
                <button type="button" onClick={() => onOpenScanKey(null)} className="btn btn-secondary btn-sm">
                  Отмена
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
