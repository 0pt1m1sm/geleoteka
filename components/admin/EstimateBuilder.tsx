"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { addJobLines } from "@/app/actions/admin";
import { formatPrice } from "@/lib/utils";

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
}) {
  const [state, formAction, isPending] = useActionState(addJobLines, null);
  const [jobs, setJobs] = useState<JobRow[]>([{ ...EMPTY_JOB }]);

  function addJob() {
    setJobs([...jobs, { ...EMPTY_JOB }]);
  }

  function removeJob(index: number) {
    setJobs(jobs.filter((_, i) => i !== index));
  }

  function updateJob(index: number, field: keyof JobRow, value: string) {
    setJobs(
      jobs.map((j, i) => (i === index ? { ...j, [field]: value } : j))
    );
  }

  const total = jobs.reduce((sum, j) => {
    const labor = (parseFloat(j.laborHours) || 0) * (parseInt(j.laborRate) || 0);
    const parts = (parseInt(j.partUnitPrice) || 0) * (parseInt(j.partQty) || 0);
    return sum + labor + parts;
  }, 0);

  return (
    <form action={formAction}>
      <div className="card space-y-4 mb-6">
        {state?.error && (
          <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
            {state.error}
          </div>
        )}

        <div>
          <label htmlFor="repairOrderId" className="block text-sm font-medium mb-2">
            Заказ-наряд *
          </label>
          <select id="repairOrderId" name="repairOrderId" required className="input">
            <option value="">Выберите заказ-наряд</option>
            {repairOrders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Работы</h3>
            <button type="button" onClick={addJob} className="btn btn-secondary text-xs py-1 px-3">
              + Добавить работу
            </button>
          </div>

          <div className="space-y-3">
            {jobs.map((job, i) => (
              <div
                key={i}
                className="space-y-2 p-3 rounded-lg bg-[var(--background-secondary)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <input
                    name="description"
                    value={job.description}
                    onChange={(e) => updateJob(i, "description", e.target.value)}
                    className="input flex-1 text-sm"
                    placeholder="Описание работы (например, замена колодок)"
                  />
                  {jobs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeJob(i)}
                      className="text-[var(--color-error)] text-xs mt-2"
                    >
                      ×
                    </button>
                  )}
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
                  />
                  <input
                    name="laborRate"
                    type="number"
                    value={job.laborRate}
                    onChange={(e) => updateJob(i, "laborRate", e.target.value)}
                    className="input text-sm"
                    placeholder="Ставка ₽/ч"
                  />
                  <input
                    name="partDescription"
                    value={job.partDescription}
                    onChange={(e) => updateJob(i, "partDescription", e.target.value)}
                    className="input text-sm col-span-2"
                    placeholder="Запчасть (опционально)"
                  />
                  <input
                    name="partQty"
                    type="number"
                    value={job.partQty}
                    onChange={(e) => updateJob(i, "partQty", e.target.value)}
                    className="input text-sm"
                    placeholder="Кол-во"
                  />
                  <input
                    name="partUnitCost"
                    type="number"
                    value={job.partUnitCost}
                    onChange={(e) => updateJob(i, "partUnitCost", e.target.value)}
                    className="input text-sm"
                    placeholder="Себестоимость ₽"
                  />
                  <input
                    name="partUnitPrice"
                    type="number"
                    value={job.partUnitPrice}
                    onChange={(e) => updateJob(i, "partUnitPrice", e.target.value)}
                    className="input text-sm col-span-2"
                    placeholder="Цена для клиента ₽"
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
      </div>

      <div className="flex gap-4">
        <Link href="/admin/estimates" className="btn btn-secondary">
          Отмена
        </Link>
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? "Сохранение..." : "Добавить и отправить клиенту"}
        </button>
      </div>
    </form>
  );
}
