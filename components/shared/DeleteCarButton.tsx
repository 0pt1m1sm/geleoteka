"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteVehicle } from "@/app/actions/cars";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

/**
 * Used from both the client's garage and the admin customer card — the action
 * itself decides who may delete what, so the same button serves both.
 *
 * `repairOrderCount` is passed in so the confirmation can say what actually
 * happens to the service history rather than leaving the operator to guess:
 * the work stays, only the link to this car goes.
 */
export function DeleteCarButton({
  vehicleId,
  label,
  repairOrderCount = 0,
  className = "text-[10px] text-[var(--color-error)] hover:underline shrink-0",
}: {
  vehicleId: string;
  /** How the car is named in the confirmation, e.g. "G 63 AMG, 2021". */
  label: string;
  repairOrderCount?: number;
  className?: string;
}): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handleDelete(): Promise<void> {
    const history =
      repairOrderCount > 0
        ? ` Заказ-наряды (${repairOrderCount}) сохранятся со всеми работами и фотографиями — из них уйдёт только ссылка на этот автомобиль.`
        : "";
    const ok = await confirm({
      title: "Удалить автомобиль",
      message: `Удалить «${label}»?${history}`,
      danger: true,
      confirmText: "Удалить",
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteVehicle(vehicleId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const detached = result.detached?.repairOrders ?? 0;
      toast.success(
        detached > 0 ? `Автомобиль удалён, заказ-наряды (${detached}) сохранены` : "Автомобиль удалён",
      );
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={handleDelete} disabled={pending} className={className}>
      {pending ? "Удаляем…" : "Удалить"}
    </button>
  );
}
