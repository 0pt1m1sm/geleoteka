"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import { createDealManually } from "@/app/actions/crm/deals";
import {
  DEAL_CHANNEL_LABELS,
} from "@/lib/deal-stage-labels";

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  vehicles: Array<{ id: string; make: string; model: string; year: number }>;
}

interface Props {
  customers: CustomerOption[];
}

const CHANNEL_OPTIONS = [
  "SERVICE",
  "PARTS_RETAIL",
  "PARTS_WHOLESALE",
  "RENTAL",
  "WALK_IN",
];

/**
 * Manager-initiated deal creation. Opens a modal-style form to pick a
 * customer + channel + (optional) vehicle, then redirects into the
 * fresh deal so the manager can add lines and create an estimate.
 *
 * Used on /admin/crm/deals and /admin/crm/estimates as the entry
 * point for new commerce — booking/parts/rentals flows still create
 * deals automatically; this form covers walk-ins and phone-leads.
 */
export function NewDealDialog({ customers }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createDealManually, null);
  const [customerUserId, setCustomerUserId] = useState("");
  const [filter, setFilter] = useState("");

  const filteredCustomers = filter
    ? customers.filter((c) =>
        (c.name + " " + c.phone).toLowerCase().includes(filter.toLowerCase()),
      )
    : customers;
  const selectedCustomer = customers.find((c) => c.id === customerUserId) ?? null;

  function closeDialog(): void {
    setOpen(false);
    setCustomerUserId("");
    setFilter("");
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        leftIcon={<Plus size={14} />}
        onClick={() => setOpen(true)}
      >
        Новая сделка
      </Button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg my-12 card bg-[var(--card)] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Новая сделка</h3>
          <button
            type="button"
            onClick={closeDialog}
            className="btn-icon"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="customerUserId" value={customerUserId} />
          {selectedCustomer ? null : (
            <Input
              label="Поиск клиента"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Имя или телефон"
              autoFocus
            />
          )}

          {selectedCustomer ? (
            <div className="card flex items-center justify-between">
              <div>
                <div className="font-medium">{selectedCustomer.name}</div>
                <div className="text-xs text-[var(--foreground-muted)]">
                  {selectedCustomer.phone}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setCustomerUserId("")}
              >
                Сменить
              </Button>
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-lg)]">
              {filteredCustomers.length === 0 ? (
                <li className="p-3 text-sm text-[var(--foreground-muted)]">
                  Клиенты не найдены
                </li>
              ) : (
                filteredCustomers.slice(0, 50).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setCustomerUserId(c.id)}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--card-hover)]"
                    >
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-[var(--foreground-muted)]">
                        {c.phone}
                        {c.vehicles.length > 0
                          ? ` · ${c.vehicles.length} ТС`
                          : ""}
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}

          {selectedCustomer ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="deal-channel">
                  Канал
                </label>
                <select
                  id="deal-channel"
                  name="channel"
                  defaultValue="SERVICE"
                  className="input text-sm"
                >
                  {CHANNEL_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {DEAL_CHANNEL_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCustomer.vehicles.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium" htmlFor="deal-vehicle">
                    Автомобиль (опционально)
                  </label>
                  <select
                    id="deal-vehicle"
                    name="vehicleId"
                    defaultValue=""
                    className="input text-sm"
                  >
                    <option value="">— не выбран —</option>
                    {selectedCustomer.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.make} {v.model} {v.year}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <Input
                label="Источник"
                name="source"
                defaultValue="walk-in"
                placeholder="walk-in / phone / referral"
              />

              <Textarea
                label="Заметка (опционально)"
                name="notes"
                rows={2}
                placeholder="Контекст / договорённости"
              />

              {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeDialog}
                  disabled={isPending}
                >
                  Отмена
                </Button>
                <Button type="submit" isLoading={isPending} disabled={isPending}>
                  Создать
                </Button>
              </div>
            </>
          ) : null}
        </form>
      </div>
    </div>
  );
}
