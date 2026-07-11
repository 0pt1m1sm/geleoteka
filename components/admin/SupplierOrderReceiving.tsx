"use client";

import { useRef, useState, useTransition, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { receiveLine, scanReceiveLine, undoReceiveLine } from "@/app/actions/supplier-orders";
import { formatPrice } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  PART: "Запчасть",
  CUSTOM: "Другое",
  FEE: "Комиссия",
  SERVICE: "Услуга",
};

const TERMINAL = new Set(["RECEIVED", "COMPLETED", "CANCELLED"]);

export interface ReceivingLine {
  lineId: string;
  type: string;
  partId: string | null;
  description: string;
  article: string | null;
  barcode: string | null;
  ordered: number;
  received: number;
  /** Purchase prices are OPTIONAL: the worker-facing receiving page must not
   *  pass them at all, so they never reach that page's serialized payload. */
  unitCost?: number;
  totalCost?: number;
}

interface Props {
  orderId: string;
  status: string;
  lines: ReceivingLine[];
  /** false → hide all money rendering (worker view). Callers that hide money
   *  must ALSO omit unitCost/totalCost from `lines` — this prop only controls
   *  markup, not the payload. */
  showFinancials?: boolean;
  /** true → expose the per-line «Сторно» control (admin/manager order page only;
   *  the server action re-checks the role — this prop is display-level). */
  allowUndo?: boolean;
}

/**
 * Receiving (приёмка) panel on the supplier-order page. Scan a code (HID
 * keyboard-wedge) or pick a PART line to receive a quantity incrementally; each
 * receive raises on-hand and optionally puts the qty into a bin. Both input
 * paths share one `isPending` lock so a scanner double-Enter cannot double-fire.
 * Terminal orders render read-only.
 */
export function SupplierOrderReceiving({
  orderId,
  status,
  lines,
  showFinancials = true,
  allowUndo = false,
}: Props): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanQty, setScanQty] = useState("1");
  const [scanLoc, setScanLoc] = useState("");

  // DRAFT is not receivable (server enforces OPEN statuses); render read-only
  // with a hint instead of controls that would only error.
  const isDraft = status === "DRAFT";
  const readOnly = TERMINAL.has(status) || isDraft;
  const receivedPartIds = lines
    .filter((l) => l.type === "PART" && l.partId && l.received > 0)
    .map((l) => l.partId as string);

  const refocus = (): void => {
    scanRef.current?.focus();
    scanRef.current?.select();
  };

  function runReceive(promise: Promise<{ error: string | null; stale?: boolean; received?: number }>): void {
    startTransition(async () => {
      const res = await promise;
      if (res.error) {
        setMsg({ kind: "err", text: res.error });
        if (res.stale) router.refresh();
      } else {
        setMsg({ kind: "ok", text: `Принято. Всего: ${res.received}` });
        router.refresh();
      }
    });
  }

  function handleScan(e: SubmitEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (isPending) return;
    const code = (scanRef.current?.value ?? "").trim();
    if (!code) return;
    const qty = parseInt(scanQty, 10) || 1;
    const loc = scanLoc.trim() || undefined;
    setMsg(null);
    startTransition(async () => {
      const res = await scanReceiveLine(orderId, code, qty, loc);
      if (res.error) {
        setMsg({ kind: "err", text: res.error });
        if (res.stale) router.refresh();
      } else {
        setMsg({ kind: "ok", text: `Принято: ${res.received}` });
        router.refresh();
      }
      if (scanRef.current) scanRef.current.value = "";
      setScanQty("1");
      refocus();
    });
  }

  function handleLineReceive(lineId: string, qty: number, expectedReceived: number, location?: string): void {
    if (isPending) return;
    setMsg(null);
    runReceive(receiveLine(orderId, lineId, qty, expectedReceived, location));
  }

  function handleLineUndo(lineId: string, qty: number, expectedReceived: number, location?: string): void {
    if (isPending) return;
    setMsg(null);
    startTransition(async () => {
      const res = await undoReceiveLine(orderId, lineId, qty, expectedReceived, location);
      if (res.error) {
        setMsg({ kind: "err", text: res.error });
        if (res.stale) router.refresh();
      } else {
        setMsg({ kind: "ok", text: `Сторно проведено. Принято: ${res.received}` });
        router.refresh();
      }
    });
  }

  // Undo is legitimate on RECEIVED (the primary case: an over-receipt noticed
  // right after the order auto-completed), but never on manual terminal states
  // or a draft. Independent of `readOnly`, which hides the RECEIVE controls.
  const canUndo = allowUndo && status !== "COMPLETED" && status !== "CANCELLED" && !isDraft;

  return (
    <section aria-label="Приёмка" className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Приёмка ({lines.length})</h2>
        {receivedPartIds.length > 0 && (
          <Link
            href={`/admin/warehouse/labels?part=${encodeURIComponent(receivedPartIds.join(","))}`}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Печать этикеток принятого
          </Link>
        )}
      </div>

      {!readOnly && (
        <form onSubmit={handleScan} className="flex flex-wrap gap-2 mb-4">
          <input
            ref={scanRef}
            autoFocus
            type="text"
            inputMode="text"
            aria-label="Штрихкод или артикул для приёмки"
            placeholder="Отсканируйте код позиции"
            className="input flex-1 min-w-[12rem]"
            disabled={isPending}
          />
          <input
            type="number"
            min={1}
            aria-label="Количество к приёмке за скан"
            value={scanQty}
            onChange={(e) => setScanQty(e.target.value)}
            className="input w-20"
            disabled={isPending}
          />
          <input
            type="text"
            aria-label="Ячейка (по умолчанию ПРИЁМКА)"
            placeholder="Ячейка (ПРИЁМКА)"
            value={scanLoc}
            onChange={(e) => setScanLoc(e.target.value)}
            className="input w-40 font-mono"
            disabled={isPending}
          />
          <button type="submit" className="btn btn-secondary" disabled={isPending}>
            {isPending ? "..." : "Принять скан"}
          </button>
        </form>
      )}

      {isDraft && (
        <p className="text-sm text-[var(--foreground-muted)] mb-3">
          Черновик не принимается — переведите заказ в «Заказ размещён», чтобы начать приёмку.
        </p>
      )}

      <div aria-live="polite" className="min-h-[1.25rem] mb-2">
        {msg && <p className={msg.kind === "ok" ? "alert-success" : "alert-error"}>{msg.text}</p>}
      </div>

      <div className="space-y-3">
        {lines.map((line) =>
          line.type === "PART" ? (
            <PartLineRow
              key={line.lineId}
              line={line}
              readOnly={readOnly}
              isPending={isPending}
              onReceive={handleLineReceive}
              canUndo={canUndo && line.received > 0}
              onUndo={handleLineUndo}
            />
          ) : (
            <div
              key={line.lineId}
              className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border)] last:border-0 last:pb-0 opacity-80"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase text-[var(--foreground-muted)] bg-[var(--background-secondary)] px-1.5 py-0.5 rounded">
                    {TYPE_LABELS[line.type] ?? line.type}
                  </span>
                  <p className="text-sm font-medium truncate">{line.description}</p>
                </div>
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  {showFinancials && line.unitCost != null
                    ? `${line.ordered} × ${formatPrice(line.unitCost)}`
                    : `${line.ordered} шт.`}
                </p>
              </div>
              {showFinancials && line.totalCost != null && (
                <p className="font-medium shrink-0">{formatPrice(line.totalCost)}</p>
              )}
            </div>
          )
        )}
      </div>
    </section>
  );
}

function PartLineRow({
  line,
  readOnly,
  isPending,
  onReceive,
  canUndo,
  onUndo,
}: {
  line: ReceivingLine;
  readOnly: boolean;
  isPending: boolean;
  onReceive: (lineId: string, qty: number, expectedReceived: number, location?: string) => void;
  canUndo: boolean;
  onUndo: (lineId: string, qty: number, expectedReceived: number, location?: string) => void;
}): React.ReactElement {
  const remaining = Math.max(0, line.ordered - line.received);
  const [qty, setQty] = useState(String(remaining > 0 ? remaining : 1));
  const [loc, setLoc] = useState("");
  const [undoQty, setUndoQty] = useState("1");
  const [undoLoc, setUndoLoc] = useState("ПРИЁМКА");

  const done = line.received >= line.ordered;
  const over = line.received > line.ordered;

  function submit(): void {
    const n = parseInt(qty, 10);
    if (!Number.isInteger(n) || n <= 0) return;
    onReceive(line.lineId, n, line.received, loc.trim() || undefined);
  }

  function submitUndo(): void {
    const n = parseInt(undoQty, 10);
    if (!Number.isInteger(n) || n <= 0 || n > line.received) return;
    onUndo(line.lineId, n, line.received, undoLoc.trim() || undefined);
  }

  return (
    <div className="pb-3 border-b border-[var(--border)] last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase text-[var(--foreground-muted)] bg-[var(--background-secondary)] px-1.5 py-0.5 rounded">
              {TYPE_LABELS.PART}
            </span>
            <p className="text-sm font-medium truncate">{line.description}</p>
          </div>
          <p className="text-xs font-mono text-[var(--foreground-muted)] mt-0.5">
            {line.article ?? ""}
            {line.barcode ? ` · ${line.barcode}` : ""}
          </p>
        </div>
        <div className="text-right text-sm shrink-0">
          <p>
            Принято:{" "}
            <span className={over ? "font-semibold text-[var(--color-error)]" : "font-medium"}>
              {line.received}
            </span>{" "}
            / {line.ordered}
          </p>
          {done ? (
            <span className="badge bg-[var(--color-success-bg)] text-[var(--color-success)]">
              {over ? "сверх заказа" : "получено"}
            </span>
          ) : (
            <span className="text-xs text-[var(--foreground-muted)]">осталось {remaining}</span>
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input
            type="number"
            min={1}
            aria-label={`Количество к приёмке: ${line.description}`}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="input w-24"
            disabled={isPending}
          />
          <input
            type="text"
            aria-label={`Ячейка (по умолчанию ПРИЁМКА): ${line.description}`}
            placeholder="Ячейка (ПРИЁМКА)"
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            className="input w-40 font-mono"
            disabled={isPending}
          />
          <button type="button" onClick={submit} disabled={isPending} className="btn btn-primary btn-sm">
            Принять
          </button>
        </div>
      )}

      {canUndo && (
        <details className="mt-2">
          <summary className="cursor-pointer select-none text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
            Сторно…
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              type="number"
              min={1}
              max={line.received}
              aria-label={`Количество к сторно: ${line.description}`}
              value={undoQty}
              onChange={(e) => setUndoQty(e.target.value)}
              className="input w-24"
              disabled={isPending}
            />
            <input
              type="text"
              aria-label={`Ячейка, из которой изъять: ${line.description}`}
              placeholder="Ячейка (пусто — без изъятия)"
              value={undoLoc}
              onChange={(e) => setUndoLoc(e.target.value)}
              className="input w-52 font-mono"
              disabled={isPending}
            />
            <button type="button" onClick={submitUndo} disabled={isPending} className="btn btn-secondary btn-sm">
              Сторнировать
            </button>
          </div>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            Снимет с остатка и уменьшит «принято». Укажите ячейку, где физически лежит товар.
          </p>
        </details>
      )}
    </div>
  );
}
