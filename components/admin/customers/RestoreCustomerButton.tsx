"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreCustomer } from "@/app/actions/crm/customers";

interface Props {
  customerUserId: string;
}

export function RestoreCustomerButton({ customerUserId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await restoreCustomer(customerUserId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="btn btn-secondary w-full sm:w-auto"
      >
        {pending ? "Восстановление…" : "Восстановить клиента"}
      </button>
      {error ? <p className="alert-error text-sm">{error}</p> : null}
    </div>
  );
}
