"use client";

import { useRouter } from "next/navigation";
import { deleteRepairOrder } from "@/app/actions/admin";

export function DeleteRepairOrderButton({
  repairOrderId,
  customerName,
}: {
  repairOrderId: string;
  customerName: string;
}) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Удалить заказ-наряд ${customerName}? Действие необратимо.`)) return;
    await deleteRepairOrder(repairOrderId);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="text-[10px] text-[var(--color-error)] hover:underline shrink-0"
      title="Удалить заказ-наряд"
    >
      Удалить
    </button>
  );
}
