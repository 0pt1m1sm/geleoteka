"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { CustomerSearchCombobox } from "@/components/admin/inbox/CustomerSearchCombobox";
import { createRepairOrderManually } from "@/app/actions/repair-orders";
import { DEAL_STAGE_LABELS } from "@/lib/deal-stage-labels";
import { formatPrice } from "@/lib/utils";

interface PickedCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface DealOption {
  id: string;
  number: string | null;
  stage: string;
  total: number;
}

interface VehicleOption {
  id: string;
  make: string | null;
  model: string;
  year: number | null;
}

function defaultDateTimeLocal(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Заказ-наряд руками — для клиента, приехавшего без записи.
 *
 * Сделка обязательна: заказ-наряд без неё существовать не может. Если у клиента
 * нет подходящей, она заводится автоматически — это лучше, чем заставлять
 * менеджера сперва идти в раздел сделок, а потом возвращаться сюда.
 *
 * Машина необязательна: поле стало nullable, потому что автомобиль — описательная
 * ссылка на бумаге, а не владелец работ. Приехавшую машину можно завести и позже.
 */
export function CreateRepairOrderDialog(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createRepairOrderManually, null);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);

  useEffect(() => {
    if (!customer) return;
    const controller = new AbortController();
    fetch(`/api/admin/customers/${customer.id}/deals`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        setDeals(Array.isArray(data?.deals) ? data.deals : []);
        setVehicles(Array.isArray(data?.vehicles) ? data.vehicles : []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [customer]);

  function clearCustomer(): void {
    setCustomer(null);
    setDeals([]);
    setVehicles([]);
  }

  function close(): void {
    setOpen(false);
    clearCustomer();
  }

  return (
    <>
      <Button type="button" size="sm" leftIcon={<Plus size={16} />} onClick={() => setOpen(true)}>
        Новый заказ-наряд
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый заказ-наряд</DialogTitle>
            <DialogDescription>
              Для клиента без записи. Если подходящей сделки нет, она создастся сама.
            </DialogDescription>
          </DialogHeader>

          <form action={formAction}>
            <DialogBody className="space-y-3">
              <input type="hidden" name="customerUserId" value={customer?.id ?? ""} />

              <div className="space-y-1.5">
                <label className="text-sm font-medium block">Клиент</label>
                {customer ? (
                  <div className="flex items-center justify-between gap-3 border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{customer.name}</div>
                      <div className="text-xs text-[var(--foreground-muted)] truncate">
                        {customer.phone}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearCustomer}
                      className="btn-icon shrink-0"
                      aria-label="Сбросить клиента"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <CustomerSearchCombobox
                    onSelect={setCustomer}
                    placeholder="Имя, email или телефон"
                  />
                )}
              </div>

              <Input
                name="dateTime"
                label="Дата и время"
                type="datetime-local"
                required
                defaultValue={defaultDateTimeLocal()}
              />

              <Select name="vehicleId" label="Автомобиль" disabled={!customer}>
                <option value="">— не указан —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {[v.make ?? "Mercedes-Benz", v.model, v.year].filter(Boolean).join(" ")}
                  </option>
                ))}
              </Select>

              <Select
                name="dealId"
                label="Сделка"
                disabled={!customer}
                helperText="Пусто — будет создана новая сделка."
              >
                <option value="">— создать новую —</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.number ?? d.id.slice(0, 8)} · {DEAL_STAGE_LABELS[d.stage] ?? d.stage} ·{" "}
                    {formatPrice(d.total)}
                  </option>
                ))}
              </Select>

              <Textarea name="concern" label="Со слов клиента" rows={3} />

              {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={close} disabled={isPending}>
                Отмена
              </Button>
              <Button type="submit" disabled={isPending || !customer}>
                {isPending ? "Создаём…" : "Создать"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
