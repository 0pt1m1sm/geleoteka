"use client";

import { useRouter } from "next/navigation";
import { updateSupplierOrderStatus } from "@/app/actions/supplier-orders";

const STATUSES = ["DRAFT", "ORDERED", "IN_TRANSIT", "CUSTOMS", "RECEIVED", "COMPLETED", "CANCELLED"];
const LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  ORDERED: "Заказ размещён",
  IN_TRANSIT: "В пути",
  CUSTOMS: "Таможня",
  RECEIVED: "Получен",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

export function SupplierOrderStatusChanger({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: string;
}) {
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await updateSupplierOrderStatus(orderId, e.target.value);
    router.refresh();
  }

  return (
    <select value={currentStatus} onChange={handleChange} className="input text-sm w-auto">
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {LABELS[s]}
        </option>
      ))}
    </select>
  );
}
