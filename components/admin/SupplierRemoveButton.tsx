"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteSupplier } from "@/app/actions/suppliers";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

/**
 * Убрать поставщика прямо из списка.
 *
 * Что произойдёт, зависит от связей: есть заказы — поставщик скрывается
 * (история закупок не должна остаться без имени, и база всё равно не даст
 * удалить: SupplierOrder.userId объявлен RESTRICT); заказов нет — запись
 * удаляется целиком. Человек узнаёт это ДО нажатия, а не из сообщения после.
 */
export function SupplierRemoveButton({
  id,
  name,
  orderCount,
}: {
  id: string;
  name: string;
  orderCount: number;
}): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handle(): void {
    void (async () => {
      const ok = await confirm({
        message:
          orderCount > 0
            ? `Скрыть поставщика «${name}»? По нему ${orderCount} заказ(ов), поэтому запись останется в истории закупок.`
            : `Удалить поставщика «${name}»? Заказов по нему нет, запись будет удалена полностью.`,
        danger: true,
        confirmText: orderCount > 0 ? "Скрыть" : "Удалить",
      });
      if (!ok) return;
      startTransition(async () => {
        const res = await deleteSupplier(id);
        toast.success(res.removed === "deleted" ? "Поставщик удалён" : "Поставщик скрыт");
        router.refresh();
      });
    })();
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-label={`Убрать поставщика: ${name}`}
      className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-[var(--color-error)] disabled:opacity-50 shrink-0"
    >
      <Trash2 size={16} aria-hidden />
    </button>
  );
}
