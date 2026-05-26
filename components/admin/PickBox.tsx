"use client";

import { useState } from "react";
import { pickRepairOrderLine } from "@/app/actions/picking";
import { ScanConsumeLines } from "@/components/admin/ScanConsumeLines";
import type { OpenPickLine } from "@/lib/warehouse/pick";

/** Per-line scan-to-pick for a repair order. The line list + scan mechanic is the
 *  shared <ScanConsumeLines>; this wrapper supplies the RO consume action. */
export function PickBox({
  repairOrderId,
  lines,
  warehouseId,
}: {
  repairOrderId: string;
  lines: OpenPickLine[];
  warehouseId?: string;
}): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openScanKey, setOpenScanKey] = useState<string | null>(null);

  return (
    <section aria-label="Отбор" className="card space-y-4">
      <h2 className="text-lg font-semibold">Отбор</h2>
      {error && <p className="alert-error">{error}</p>}
      {success && <p className="alert-success">{success}</p>}
      <ScanConsumeLines
        lines={lines.map((l) => ({ ...l, lineKey: l.lineId }))}
        actionLabel="Отобрать"
        successVerb="Отобрано"
        emptyMessage="Все позиции этого заказа отобраны."
        onConsume={(lineKey, partCode, binCode) =>
          pickRepairOrderLine(repairOrderId, lineKey, partCode, binCode, warehouseId)
        }
        openScanKey={openScanKey}
        onOpenScanKey={setOpenScanKey}
        setError={setError}
        setSuccess={setSuccess}
      />
    </section>
  );
}
