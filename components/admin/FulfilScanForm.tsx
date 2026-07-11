"use client";

import { useRef, useState } from "react";
import { QrScanner } from "@/components/warehouse/QrScanner";

/** Unified fulfilment lookup: scan/type an order code and submit. Navigation is a
 *  native GET to /admin/warehouse/fulfill?code=… — the server resolves the code
 *  and redirects to picking or packing, so no client server-action is needed. */
export function FulfilScanForm({ notFoundCode }: { notFoundCode: string | null }): React.ReactElement {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);

  function handleScan(raw: string): void {
    const code = raw.trim();
    if (!code) return;
    if (inputRef.current) inputRef.current.value = code;
    setScanning(false);
    formRef.current?.requestSubmit();
  }

  return (
    <section aria-label="Выдача" className="card space-y-4">
      {notFoundCode && (
        <p className="alert-error">
          Заказ не найден: <span className="font-mono">{notFoundCode}</span>
        </p>
      )}

      <form ref={formRef} method="get" action="/admin/warehouse/fulfill" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 min-w-[12rem]">
          <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Номер заказа</span>
          <input
            ref={inputRef}
            name="code"
            defaultValue={notFoundCode ?? ""}
            placeholder="PO-1234 / номер заказа-наряда / QR"
            aria-label="Номер заказа"
            className="input font-mono"
          />
        </label>
        <button type="submit" className="btn btn-primary min-h-[44px]">
          Открыть
        </button>
        <button
          type="button"
          onClick={() => setScanning((s) => !s)}
          aria-label="Сканировать код заказа камерой"
          className="btn btn-secondary min-h-[44px]"
        >
          Сканировать камерой
        </button>
      </form>

      {scanning && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 space-y-2">
          <p className="text-xs font-medium text-[var(--foreground-muted)]">Наведите на код заказа</p>
          <QrScanner onScan={handleScan} />
          <button type="button" onClick={() => setScanning(false)} className="btn btn-secondary btn-sm">
            Отмена
          </button>
        </div>
      )}

      <p className="text-xs text-[var(--foreground-muted)]">
        Заказ на запчасти → упаковка; заказ-наряд → отбор. Нужный режим определяется автоматически.
      </p>
    </section>
  );
}
