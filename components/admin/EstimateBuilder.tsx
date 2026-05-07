"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { addJobLines } from "@/app/actions/admin";
import { formatPrice } from "@/lib/utils";
import { Alert, Button, Card, Select } from "@/components/ui";

interface JobRow {
  description: string;
  laborHours: string;
  laborRate: string;
  partDescription: string;
  partQty: string;
  partUnitCost: string;
  partUnitPrice: string;
}

const EMPTY_JOB: JobRow = {
  description: "",
  laborHours: "",
  laborRate: "",
  partDescription: "",
  partQty: "1",
  partUnitCost: "",
  partUnitPrice: "",
};

export function EstimateBuilder({
  repairOrders,
}: {
  repairOrders: { id: string; label: string }[];
}): React.ReactElement {
  const [state, formAction, isPending] = useActionState(addJobLines, null);
  const [jobs, setJobs] = useState<JobRow[]>([{ ...EMPTY_JOB }]);

  function addJob(): void {
    setJobs([...jobs, { ...EMPTY_JOB }]);
  }

  function removeJob(index: number): void {
    setJobs(jobs.filter((_, i) => i !== index));
  }

  function updateJob(index: number, field: keyof JobRow, value: string): void {
    setJobs(jobs.map((j, i) => (i === index ? { ...j, [field]: value } : j)));
  }

  const total = jobs.reduce((sum, j) => {
    const labor = (parseFloat(j.laborHours) || 0) * (parseInt(j.laborRate) || 0);
    const parts = (parseInt(j.partUnitPrice) || 0) * (parseInt(j.partQty) || 0);
    return sum + labor + parts;
  }, 0);

  return (
    <form action={formAction}>
      <Card className="space-y-4 mb-6">
        {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

        <Select
          label="Заказ-наряд *"
          id="repairOrderId"
          name="repairOrderId"
          required
        >
          <option value="">Выберите заказ-наряд</option>
          {repairOrders.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Работы</h3>
            <Button type="button" onClick={addJob} variant="secondary" size="sm" leftIcon={<Plus size={14} />}>
              Добавить работу
            </Button>
          </div>

          <div className="space-y-3">
            {jobs.map((job, i) => (
              <div
                key={i}
                className="space-y-2 p-3 rounded-[var(--radius-lg)] bg-[var(--background-secondary)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <input
                    name="description"
                    value={job.description}
                    onChange={(e) => updateJob(i, "description", e.target.value)}
                    className="input flex-1 text-sm"
                    placeholder="Описание работы (например, замена колодок)"
                  />
                  {jobs.length > 1 ? (
                    <Button
                      type="button"
                      onClick={() => removeJob(i)}
                      variant="ghost"
                      size="sm"
                      aria-label="Удалить работу"
                    >
                      <X size={14} />
                    </Button>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input
                    name="laborHours"
                    type="number"
                    step="0.25"
                    value={job.laborHours}
                    onChange={(e) => updateJob(i, "laborHours", e.target.value)}
                    className="input text-sm"
                    placeholder="Часы"
                    aria-label="Часы работы"
                  />
                  <input
                    name="laborRate"
                    type="number"
                    value={job.laborRate}
                    onChange={(e) => updateJob(i, "laborRate", e.target.value)}
                    className="input text-sm"
                    placeholder="Ставка ₽/ч"
                    aria-label="Ставка работы"
                  />
                  <input
                    name="partDescription"
                    value={job.partDescription}
                    onChange={(e) => updateJob(i, "partDescription", e.target.value)}
                    className="input text-sm col-span-2"
                    placeholder="Запчасть (опционально)"
                    aria-label="Описание запчасти"
                  />
                  <input
                    name="partQty"
                    type="number"
                    value={job.partQty}
                    onChange={(e) => updateJob(i, "partQty", e.target.value)}
                    className="input text-sm"
                    placeholder="Кол-во"
                    aria-label="Количество"
                  />
                  <input
                    name="partUnitCost"
                    type="number"
                    value={job.partUnitCost}
                    onChange={(e) => updateJob(i, "partUnitCost", e.target.value)}
                    className="input text-sm"
                    placeholder="Себестоимость ₽"
                    aria-label="Себестоимость"
                  />
                  <input
                    name="partUnitPrice"
                    type="number"
                    value={job.partUnitPrice}
                    onChange={(e) => updateJob(i, "partUnitPrice", e.target.value)}
                    className="input text-sm col-span-2"
                    placeholder="Цена для клиента ₽"
                    aria-label="Цена для клиента"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
          <span className="text-[var(--foreground-muted)]">Итого:</span>
          <span className="text-xl font-bold text-[var(--color-accent)]">
            {formatPrice(total)}
          </span>
        </div>
      </Card>

      <div className="flex gap-4">
        <Link href="/admin/estimates">
          <Button type="button" variant="secondary">Отмена</Button>
        </Link>
        <Button type="submit" isLoading={isPending}>
          {isPending ? "Сохранение..." : "Добавить и отправить клиенту"}
        </Button>
      </div>
    </form>
  );
}
