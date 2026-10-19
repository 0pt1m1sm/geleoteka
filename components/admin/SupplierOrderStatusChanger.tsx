"use client";

import { useRouter } from "next/navigation";
import { updateSupplierOrderStatus } from "@/app/actions/supplier-orders";
import { toast } from "@/lib/ui/toast";
import { SUPPLIER_ORDER_STATUS_LABELS } from "@/lib/suppliers/order-lifecycle";

// RECEIVED / PARTIALLY_RECEIVED are auto-only — set by receiving, never picked
// by hand — so they are not offered as manual options.
const STATUSES = ["DRAFT", "ORDERED", "IN_TRANSIT", "CUSTOMS", "COMPLETED", "CANCELLED"];
const AUTO_ONLY = new Set(["RECEIVED", "PARTIALLY_RECEIVED"]);
const LABELS = SUPPLIER_ORDER_STATUS_LABELS;

export function SupplierOrderStatusChanger({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: string;
}) {
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    try {
      await updateSupplierOrderStatus(orderId, e.target.value);
      toast.success("Статус заказа обновлён");
    } catch {
      toast.error("Не удалось обновить статус заказа");
    }
    router.refresh();
  }

  // Auto-only statuses are owned by receiving — show a read-only badge, not a picker.
  if (AUTO_ONLY.has(currentStatus)) {
    return (
      <span className="badge bg-[var(--color-success-bg)] text-[var(--color-success)]">
        {LABELS[currentStatus] ?? currentStatus}
      </span>
    );
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      aria-label="Статус заказа поставщику"
      className="input text-sm w-auto"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {LABELS[s]}
        </option>
      ))}
    </select>
  );
}
