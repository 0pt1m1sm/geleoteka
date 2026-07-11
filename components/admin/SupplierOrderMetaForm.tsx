"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSupplierOrderMeta } from "@/app/actions/supplier-orders";

interface Props {
  orderId: string;
  orderNumber: string;
  trackingNumber: string;
  /** yyyy-mm-dd or "". */
  estimatedArrival: string;
  notes: string;
}

/** Meta-only edit (№ / трекинг / дата прибытия / заметки) for non-terminal
 *  orders — collapsed by default under the order header. Lines and costs are
 *  DRAFT-only and live on the /edit page. */
export function SupplierOrderMetaForm({ orderId, ...initial }: Props): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [orderNumber, setOrderNumber] = useState(initial.orderNumber);
  const [trackingNumber, setTrackingNumber] = useState(initial.trackingNumber);
  const [estimatedArrival, setEstimatedArrival] = useState(initial.estimatedArrival);
  const [notes, setNotes] = useState(initial.notes);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function save(): void {
    if (isPending) return;
    setMsg(null);
    startTransition(async () => {
      const res = await updateSupplierOrderMeta(orderId, { orderNumber, trackingNumber, estimatedArrival, notes });
      if (res.success) {
        setMsg({ kind: "ok", text: "Сохранено" });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error ?? "Не удалось сохранить" });
      }
    });
  }

  return (
    <details className="card">
      <summary className="cursor-pointer select-none font-semibold text-sm">Изменить детали заказа</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block text-xs text-[var(--foreground-muted)] mb-1">№ заказа</span>
          <input type="text" className="input w-full" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} disabled={isPending} />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-[var(--foreground-muted)] mb-1">Трекинг-номер</span>
          <input type="text" className="input w-full font-mono" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} disabled={isPending} />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-[var(--foreground-muted)] mb-1">Ожидаемая дата прибытия</span>
          <input type="date" className="input w-full" value={estimatedArrival} onChange={(e) => setEstimatedArrival(e.target.value)} disabled={isPending} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="block text-xs text-[var(--foreground-muted)] mb-1">Заметки</span>
          <textarea className="input w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isPending} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={save} disabled={isPending} className="btn btn-primary btn-sm">
          {isPending ? "Сохранение..." : "Сохранить"}
        </button>
        <div aria-live="polite">
          {msg && <span className={msg.kind === "ok" ? "text-sm text-[var(--color-success)]" : "alert-error text-sm"}>{msg.text}</span>}
        </div>
      </div>
    </details>
  );
}
