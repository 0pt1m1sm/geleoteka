"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { setCustomerManager } from "@/app/actions/crm/customers";
import { Alert, Button } from "@/components/ui";

interface StaffOption {
  id: string;
  name: string;
  permissionRole: "ADMIN" | "MANAGER";
}

interface Props {
  customerUserId: string;
  manager: { id: string; name: string } | null;
}

export function CustomerManagerSelector({
  customerUserId,
  manager,
}: Props): React.ReactElement {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(setCustomerManager, null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/staff", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("staff request failed");
        return response.json() as Promise<{ staff?: unknown }>;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setStaff(Array.isArray(data.staff) ? (data.staff as StaffOption[]) : []);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadError("Не удалось загрузить список сотрудников");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (state && !state.error && !isPending) router.refresh();
  }, [isPending, router, state]);

  const currentManagerIsMissing =
    manager !== null && !staff.some((employee) => employee.id === manager.id);

  return (
    <form action={formAction} className="card space-y-3">
      <input type="hidden" name="customerUserId" value={customerUserId} />
      <div>
        <h2 className="text-lg font-semibold">Персональный менеджер</h2>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          Получает сообщения клиента в первую очередь.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="customer-manager">
          Менеджер
        </label>
        <select
          id="customer-manager"
          name="managerUserId"
          defaultValue={manager?.id ?? ""}
          className="input text-sm"
        >
          <option value="">— не назначен —</option>
          {currentManagerIsMissing ? (
            <option value={manager.id}>{manager.name}</option>
          ) : null}
          {staff.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </div>
      {loadError ? <Alert variant="error">{loadError}</Alert> : null}
      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" isLoading={isPending} disabled={isPending || !!loadError}>
          Сохранить менеджера
        </Button>
      </div>
    </form>
  );
}
