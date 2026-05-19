"use client";

import { useRouter } from "next/navigation";
import { deleteRepairOrder } from "@/app/actions/admin";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

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
    toast.success("Заказ-наряд удалён");
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
