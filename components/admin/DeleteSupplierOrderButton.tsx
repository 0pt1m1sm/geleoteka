"use client";

import { useState, useTransition } from "react";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import { deleteSupplierOrder } from "@/app/actions/supplier-orders";

/** Confirm-gated deletion of a DRAFT order. Two-step inline confirm instead of
 *  a native confirm() dialog (browser dialogs block automation and are easy to
 *  click through). */
export function DeleteSupplierOrderButton({ orderId }: { orderId: string }): React.ReactElement {
  const nav = useProgressRouter();
  const [isPending, startTransition] = useTransition();
  const [arming, setArming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(): void {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSupplierOrder(orderId);
      if (res.success) {
        nav.push("/admin/suppliers/orders");
      } else {
        setError(res.error ?? "Не удалось удалить");
        setArming(false);
      }
    });
  }

  if (!arming) {
    return (
      <span className="inline-flex items-center gap-2">
        <button type="button" onClick={() => setArming(true)} className="btn btn-secondary btn-sm text-[var(--color-error)]">
          Удалить черновик
        </button>
        {error && <span className="text-xs text-[var(--color-error)]">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-[var(--foreground-muted)]">Удалить безвозвратно?</span>
      <button type="button" onClick={run} disabled={isPending} className="btn btn-primary btn-sm bg-[var(--color-error)]">
        {isPending ? "Удаление..." : "Да, удалить"}
      </button>
      <button type="button" onClick={() => setArming(false)} disabled={isPending} className="btn btn-secondary btn-sm">
        Отмена
      </button>
    </span>
  );
}
