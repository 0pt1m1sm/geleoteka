"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Alert, Button, Input, Select } from "@/components/ui";
import {
  addJobLine,
  deleteJobLine,
  updateJobLine,
} from "@/app/actions/admin";
import { JOB_LINE_STATUS_LABELS, formatPrice } from "@/lib/utils";

interface JobLineView {
  id: string;
  description: string;
  status: string;
  laborTotal: number;
  partsTotal: number;
  total: number;
}

interface Props {
  repairOrderId: string;
  initialJobs: JobLineView[];
}

const STATUS_OPTIONS = [
  "PROPOSED",
  "APPROVED",
  "DECLINED",
  "DEFERRED",
  "IN_PROGRESS",
  "DONE",
];

/**
 * Inline CRUD over a RepairOrder's JobLine rows. Each row is its own
 * edit form (server action) so saves and deletes don't lose state in
 * sibling rows. Adds a new row via a collapsed form at the bottom.
 */
export function JobLineEditor({
  repairOrderId,
  initialJobs,
}: Props): React.ReactElement {
  const [showAdd, setShowAdd] = useState(initialJobs.length === 0);

  return (
    <div className="space-y-3">
      {initialJobs.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          Работы ещё не добавлены.
        </p>
      ) : (
        <ul className="space-y-3">
          {initialJobs.map((job) => (
            <li key={job.id}>
              <JobLineRow job={job} />
            </li>
          ))}
        </ul>
      )}

      {showAdd ? (
        <AddJobLineRow
          repairOrderId={repairOrderId}
          onCancel={() => setShowAdd(false)}
          allowCancel={initialJobs.length > 0}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={() => setShowAdd(true)}
        >
          Добавить работу
        </Button>
      )}

      <RepairOrderTotalsRow jobs={initialJobs} />
    </div>
  );
}

function JobLineRow({ job }: { job: JobLineView }): React.ReactElement {
  const [state, formAction, isPending] = useActionState(updateJobLine, null);
  const [isDeleting, startDelete] = useTransition();

  function handleDelete(): void {
    if (!confirm("Удалить эту работу?")) return;
    startDelete(async () => {
      await deleteJobLine(job.id);
    });
  }

  return (
    <form
      action={formAction}
      className="space-y-2 p-3 rounded-[var(--radius-lg)] bg-[var(--background-secondary)] border border-[var(--border)]"
    >
      <input type="hidden" name="jobLineId" value={job.id} />

      <div className="flex items-start gap-2">
        <input
          name="description"
          defaultValue={job.description}
          className="input flex-1 text-sm"
          placeholder="Описание работы"
          aria-label="Описание работы"
          required
        />
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="btn-icon"
          aria-label="Удалить работу"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Input
          name="laborTotal"
          type="number"
          inputMode="numeric"
          defaultValue={String(job.laborTotal)}
          aria-label="Стоимость работ"
          placeholder="Работы ₽"
        />
        <Input
          name="partsTotal"
          type="number"
          inputMode="numeric"
          defaultValue={String(job.partsTotal)}
          aria-label="Стоимость запчастей"
          placeholder="Запчасти ₽"
        />
        <Select
          name="status"
          defaultValue={job.status}
          aria-label="Статус работы"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {JOB_LINE_STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </Select>
      </div>

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--foreground-muted)]">
          Итого: {formatPrice(job.total)}
        </span>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          isLoading={isPending}
          disabled={isPending || isDeleting}
        >
          Сохранить
        </Button>
      </div>
    </form>
  );
}

function AddJobLineRow({
  repairOrderId,
  onCancel,
  allowCancel,
}: {
  repairOrderId: string;
  onCancel: () => void;
  allowCancel: boolean;
}): React.ReactElement {
  const [state, formAction, isPending] = useActionState(addJobLine, null);

  return (
    <form
      action={formAction}
      className="space-y-2 p-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-hover)]"
    >
      <input type="hidden" name="repairOrderId" value={repairOrderId} />

      <div className="flex items-start gap-2">
        <input
          name="description"
          className="input flex-1 text-sm"
          placeholder="Новая работа (например, замена колодок)"
          aria-label="Описание новой работы"
          required
        />
        {allowCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="btn-icon"
            aria-label="Отменить добавление"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Input
          name="laborTotal"
          type="number"
          inputMode="numeric"
          defaultValue="0"
          aria-label="Стоимость работ"
          placeholder="Работы ₽"
        />
        <Input
          name="partsTotal"
          type="number"
          inputMode="numeric"
          defaultValue="0"
          aria-label="Стоимость запчастей"
          placeholder="Запчасти ₽"
        />
        <Select name="status" defaultValue="PROPOSED" aria-label="Статус работы">
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {JOB_LINE_STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </Select>
      </div>

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="flex justify-end">
        <Button type="submit" size="sm" isLoading={isPending} disabled={isPending}>
          Добавить
        </Button>
      </div>
    </form>
  );
}

function RepairOrderTotalsRow({
  jobs,
}: {
  jobs: JobLineView[];
}): React.ReactElement {
  const labor = jobs.reduce((s, j) => s + j.laborTotal, 0);
  const parts = jobs.reduce((s, j) => s + j.partsTotal, 0);
  const total = jobs.reduce((s, j) => s + j.total, 0);

  return (
    <div className="pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-3 text-sm">
      <div>
        <div className="text-xs text-[var(--foreground-muted)]">Работы</div>
        <div>{formatPrice(labor)}</div>
      </div>
      <div>
        <div className="text-xs text-[var(--foreground-muted)]">Запчасти</div>
        <div>{formatPrice(parts)}</div>
      </div>
      <div>
        <div className="text-xs text-[var(--foreground-muted)]">Итого</div>
        <div className="font-bold text-[var(--color-accent)]">
          {formatPrice(total)}
        </div>
      </div>
    </div>
  );
}
