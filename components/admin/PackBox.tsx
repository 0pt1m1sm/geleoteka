"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { packOrderLine, recordPackBoxScan, shipPackedOrder } from "@/app/actions/packing";
import { QrScanner } from "@/components/warehouse/QrScanner";
import { ScanConsumeLines } from "@/components/admin/ScanConsumeLines";
import type { OpenPackLine } from "@/lib/warehouse/pack";

/** Pack flow for one order: scan a parcel (box), pack each line via the shared
 *  <ScanConsumeLines>, then confirm shipment (PROCESSING → SHIPPED) once no open
 *  lines remain. The open-scanner key is a single union ("box" | lineKey | null)
 *  so only one camera stream ever mounts (box and line scanners are mutually
 *  exclusive by construction). */
export function PackBox({
  orderId,
  lines,
  warehouseId,
}: {
  orderId: string;
  lines: OpenPackLine[];
  warehouseId?: string;
}): React.ReactElement {
  // useRouter only for .refresh(); we never .push here.
  const refreshRouter = useRouter();
  const [box, setBox] = useState("");
  const [boxConfirmed, setBoxConfirmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openScanKey, setOpenScanKey] = useState<string | null>(null); // "box" | lineKey | null
  const [isShipPending, startShipTransition] = useTransition();
  const [isBoxPending, startBoxTransition] = useTransition();

  function handleBoxScan(raw: string): void {
    const code = raw.trim();
    if (!code) return;
    setBox(code);
    setOpenScanKey(null);
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
          onClick={() => setOpenScanKey("box")}
          aria-label="Сканировать короб камерой"
          className="btn btn-secondary min-h-[44px]"
        >
          Сканировать камерой
        </button>
        {boxConfirmed && <span className="badge font-mono">{boxConfirmed}</span>}
      </div>

      {openScanKey === "box" && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 space-y-2">
          <p className="text-xs font-medium text-[var(--foreground-muted)]">Наведите на код короба</p>
          <QrScanner onScan={handleBoxScan} />
          <button type="button" onClick={() => setOpenScanKey(null)} className="btn btn-secondary btn-sm">
            Отмена
          </button>
        </div>
      )}

      <ScanConsumeLines
        lines={lines}
        actionLabel="Упаковать"
        successVerb="Упаковано"
        emptyMessage="Все позиции этого заказа упакованы."
        onConsume={(lineKey, partCode, binCode) =>
          packOrderLine(orderId, lineKey, partCode, binCode, warehouseId)
        }
        openScanKey={openScanKey}
        onOpenScanKey={setOpenScanKey}
        setError={setError}
        setSuccess={setSuccess}
      />

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
