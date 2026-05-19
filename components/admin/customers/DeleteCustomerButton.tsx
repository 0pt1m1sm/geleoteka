"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomer } from "@/app/actions/crm/customers";

interface Props {
  customerUserId: string;
  isGuest: boolean;
}

export function DeleteCustomerButton({ customerUserId, isGuest }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const confirmMessage = isGuest
      ? "Удалить гостевую запись безвозвратно? Связанные данные тоже удалятся."
      : "Удалить клиента? История сделок и заказ-нарядов сохранится, но клиент исчезнет из списков.";

    if (!window.confirm(confirmMessage)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteCustomer(customerUserId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/admin/customers");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="btn btn-secondary text-[var(--color-error)] w-full sm:w-auto"
      >
        {pending ? "Удаление…" : "Удалить клиента"}
      </button>
      {error ? <p className="alert-error text-sm">{error}</p> : null}
    </div>
  );
}
