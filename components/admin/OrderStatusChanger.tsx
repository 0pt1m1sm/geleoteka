"use client";

import { useRouter } from "next/navigation";
import { updatePartOrderStatus } from "@/app/actions/part-order-admin";

const STATUSES = ["PENDING", "CONFIRMED", "SHIPPED", "COMPLETED", "CANCELLED"];
const LABELS: Record<string, string> = {
  PENDING: "Ожидает",
  CONFIRMED: "Подтверждён",
  SHIPPED: "Отправлен",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

export function OrderStatusChanger({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: string;
}) {
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await updatePartOrderStatus(orderId, e.target.value);
    router.refresh();
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      className="input text-xs py-1 px-2 w-auto"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {LABELS[s]}
        </option>
      ))}
    </select>
  );
}
