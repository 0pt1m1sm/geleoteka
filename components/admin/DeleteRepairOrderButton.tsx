"use client";

import { useRouter } from "next/navigation";
import { deleteRepairOrder } from "@/app/actions/admin";
import { confirm } from "@/lib/ui/confirm";

export function DeleteRepairOrderButton({
  repairOrderId,
  customerName,
}: {
  repairOrderId: string;
  customerName: string;
}) {
  const router = useRouter();

  async function handleDelete() {
    if (!(await confirm({ message: `Удалить заказ-наряд ${customerName}? Действие необратимо.`, danger: true }))) return;
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
