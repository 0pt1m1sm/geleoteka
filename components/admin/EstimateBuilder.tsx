"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { addJobLines } from "@/app/actions/admin";
import { formatPrice } from "@/lib/utils";
import { Alert, Button, Card, Input, Select } from "@/components/ui";

interface JobRow {
  description: string;
  laborHours: string;
  laborRate: string;
  partDescription: string;
  partQty: string;
  partUnitPrice: string;
}

const EMPTY_JOB: JobRow = {
  description: "",
  laborHours: "",
  laborRate: "",
  partDescription: "",
  partQty: "1",
  partUnitPrice: "",
};

function computeRowTotal(j: JobRow): { labor: number; parts: number; total: number } {
  const labor = (parseFloat(j.laborHours) || 0) * (parseInt(j.laborRate, 10) || 0);
  const parts = (parseInt(j.partUnitPrice, 10) || 0) * (parseInt(j.partQty, 10) || 0);
  return { labor: Math.round(labor), parts, total: Math.round(labor) + parts };
}

export function EstimateBuilder({
  repairOrders,
}: {
  repairOrders: { id: string; label: string }[];
}): React.ReactElement {
  const [state, formAction, isPending] = useActionState(addJobLines, null);
  const [jobs, setJobs] = useState<JobRow[]>([{ ...EMPTY_JOB }]);
  const lastDescRef = useRef<HTMLInputElement | null>(null);

  function addJob(): void {
    setJobs((prev) => [...prev, { ...EMPTY_JOB }]);
    // Focus the new row's description on next paint.
    queueMicrotask(() => lastDescRef.current?.focus());
  }

  function removeJob(index: number): void {
    setJobs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateJob(index: number, field: keyof JobRow, value: string): void {
    setJobs((prev) => prev.map((j, i) => (i === index ? { ...j, [field]: value } : j)));
  }

  const totals = jobs.reduce(
    (acc, j) => {
      const r = computeRowTotal(j);
      return {
        labor: acc.labor + r.labor,
        parts: acc.parts + r.parts,
        total: acc.total + r.total,
      };
    },
    { labor: 0, parts: 0, total: 0 },
  );

  return (
    <form action={formAction} className="space-y-6">
      <Card className="space-y-5">
        {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

        <Select
          label="Заказ-наряд"
          id="repairOrderId"
          name="repairOrderId"
          required
          helperText="Выберите запись клиента, к которой относится смета"
        >
          <option value="">Выберите заказ-наряд</option>
          {repairOrders.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Работы по заказу</h3>
            <Button
              type="button"
              onClick={addJob}
              variant="secondary"
              size="sm"
              leftIcon={<Plus size={14} />}
            >
              Добавить работу
            </Button>
          </div>

          <ul className="space-y-4">
            {jobs.map((job, i) => {
              const isLast = i === jobs.length - 1;
              const row = computeRowTotal(job);
              return (
                <li key={i}>
                  <JobRowFields
                    index={i}
                    job={job}
                    rowTotal={row}
                    canRemove={jobs.length > 1}
                    descriptionRef={isLast ? lastDescRef : null}
                    onChange={(field, value) => updateJob(i, field, value)}
                    onRemove={() => removeJob(i)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-[var(--foreground-muted)]">
            <span className="mr-4">
              Работы: <span className="text-[var(--foreground)] font-medium">{formatPrice(totals.labor)}</span>
            </span>
            <span>
              Запчасти: <span className="text-[var(--foreground)] font-medium">{formatPrice(totals.parts)}</span>
            </span>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
              Итого по смете
            </div>
            <div className="text-2xl font-bold text-[var(--color-accent)]">
              {formatPrice(totals.total)}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex gap-3">
        <Link href="/admin/repair-orders?status=SCHEDULED">
          <Button type="button" variant="secondary">Отмена</Button>
        </Link>
        <Button type="submit" isLoading={isPending} disabled={isPending}>
          {isPending ? "Сохранение…" : "Добавить и отправить клиенту"}
        </Button>
      </div>
    </form>
  );
}

interface JobRowFieldsProps {
  index: number;
  job: JobRow;
  rowTotal: { labor: number; parts: number; total: number };
  canRemove: boolean;
  descriptionRef: React.RefObject<HTMLInputElement | null> | null;
  onChange: (field: keyof JobRow, value: string) => void;
  onRemove: () => void;
}

function JobRowFields({
  index,
  job,
  rowTotal,
  canRemove,
  descriptionRef,
  onChange,
  onRemove,
}: JobRowFieldsProps): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <span
          className="shrink-0 text-xs font-mono text-[var(--foreground-muted)]"
          aria-hidden
        >
          #{index + 1}
        </span>
        <input
          ref={descriptionRef ?? undefined}
          name="description"
          value={job.description}
          onChange={(e) => onChange("description", e.target.value)}
          className="input flex-1 text-sm"
          placeholder="Например: замена передних тормозных колодок"
          aria-label={`Описание работы #${index + 1}`}
          required
        />
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="btn-icon"
            aria-label={`Удалить работу #${index + 1}`}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-y md:divide-y-0 divide-[var(--border)]">
        <div className="p-4 space-y-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--foreground-muted)]">
            Работы
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Часы"
              name="laborHours"
              type="number"
              step="0.25"
              min="0"
              inputMode="decimal"
              value={job.laborHours}
              onChange={(e) => onChange("laborHours", e.target.value)}
              placeholder="0"
              className="job-line-num"
            />
            <Input
              label="Ставка ₽/ч"
              name="laborRate"
              type="number"
              min="0"
              inputMode="numeric"
              value={job.laborRate}
              onChange={(e) => onChange("laborRate", e.target.value)}
              placeholder="0"
              className="job-line-num"
            />
          </div>
          <div className="flex items-baseline justify-between text-xs text-[var(--foreground-muted)]">
            <span>Сумма работ</span>
            <span className="text-sm text-[var(--foreground)] font-medium tabular-nums">
              {formatPrice(rowTotal.labor)}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--foreground-muted)]">
            Запчасти (опционально)
          </div>
          <Input
            label="Наименование"
            name="partDescription"
            value={job.partDescription}
            onChange={(e) => onChange("partDescription", e.target.value)}
            placeholder="например: колодки Brembo P50047"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Кол-во"
              name="partQty"
              type="number"
              min="0"
              inputMode="numeric"
              value={job.partQty}
              onChange={(e) => onChange("partQty", e.target.value)}
            />
            <Input
              label="Цена ₽"
              name="partUnitPrice"
              type="number"
              min="0"
              inputMode="numeric"
              value={job.partUnitPrice}
              onChange={(e) => onChange("partUnitPrice", e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex items-baseline justify-between text-xs text-[var(--foreground-muted)]">
            <span>Сумма запчастей</span>
            <span className="text-sm text-[var(--foreground)] font-medium tabular-nums">
              {formatPrice(rowTotal.parts)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center px-4 py-3 border-t border-[var(--border)] bg-[var(--background-secondary)] text-sm">
        <span className="text-[var(--foreground-muted)]">Итого по работе</span>
        <span className="font-bold text-[var(--color-accent)]">
          {formatPrice(rowTotal.total)}
        </span>
      </div>
    </div>
  );
}
