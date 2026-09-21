"use client";

import { useTransition } from "react";
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
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    void (async () => {
      if (!(await confirm({ message: `Удалить заказ-наряд ${customerName}? Действие необратимо.`, danger: true }))) return;
      startTransition(async () => {
        try {
          await deleteRepairOrder(repairOrderId);
          toast.success("Заказ-наряд удалён");
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Не удалось удалить заказ-наряд");
        }
      });
    })();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="text-[10px] text-[var(--color-error)] hover:underline shrink-0 disabled:opacity-50"
      title="Удалить заказ-наряд"
    >
      Удалить
    </button>
  );
}
