"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";
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
  laborLines: Array<{ bookHours: number; rate: number }>;
  partLines: Array<{
    description: string;
    qty: number;
    unitCost: number;
    unitPrice: number;
  }>;
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

interface RowDraft {
  description: string;
  laborHours: string;
  laborRate: string;
  partDescription: string;
  partQty: string;
  partUnitPrice: string;
  status: string;
}

const EMPTY_DRAFT: RowDraft = {
  description: "",
  laborHours: "",
  laborRate: "",
  partDescription: "",
  partQty: "1",
  partUnitPrice: "",
  status: "PROPOSED",
};

function computeTotal(d: RowDraft): { labor: number; parts: number; total: number } {
  const labor = Math.round((parseFloat(d.laborHours) || 0) * (parseInt(d.laborRate, 10) || 0));
  const parts = d.partDescription.trim()
    ? (parseInt(d.partUnitPrice, 10) || 0) * (parseInt(d.partQty, 10) || 0)
    : 0;
  return { labor, parts, total: labor + parts };
}

function draftFromJob(job: JobLineView): RowDraft {
  const labor = job.laborLines[0];
  const part = job.partLines[0];
  const laborFallback = !labor && job.laborTotal > 0;
  const partFallback = !part && job.partsTotal > 0;
  return {
    description: job.description,
    laborHours: labor ? String(labor.bookHours) : laborFallback ? "1" : "",
    laborRate: labor ? String(labor.rate) : laborFallback ? String(job.laborTotal) : "",
    partDescription: part ? part.description : partFallback ? "Запчасть" : "",
    partQty: part ? String(part.qty) : "1",
    partUnitPrice: part ? String(part.unitPrice) : partFallback ? String(job.partsTotal) : "",
    status: job.status,
  };
}

/**
 * Inline CRUD over a RepairOrder's JobLine rows. Each row is its own
 * edit form (server action) so saves and deletes don't lose state in
 * sibling rows. Mirrors EstimateBuilder field set 1:1: granular
 * hours × rate + part description/qty/cost/price.
 */
export function JobLineEditor({
  repairOrderId,
  initialJobs,
}: Props): React.ReactElement {
  const [showAdd, setShowAdd] = useState(initialJobs.length === 0);

  return (
    <div className="space-y-4">
      {initialJobs.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          Работы ещё не добавлены.
        </p>
      ) : (
        <ul className="space-y-4">
          {initialJobs.map((job, i) => (
            <li key={job.id}>
              <JobLineRow job={job} index={i} />
            </li>
          ))}
        </ul>
      )}

      {showAdd ? (
        <AddJobLineRow
          repairOrderId={repairOrderId}
          index={initialJobs.length}
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

function JobLineRow({
  job,
  index,
}: {
  job: JobLineView;
  index: number;
}): React.ReactElement {
  const [state, formAction, isPending] = useActionState(updateJobLine, null);
  const [isDeleting, startDelete] = useTransition();
  const [draft, setDraft] = useState<RowDraft>(() => draftFromJob(job));
  const totals = computeTotal(draft);

  async function handleDelete(): Promise<void> {
    if (!(await confirm({ message: "Удалить эту работу?", danger: true, confirmText: "Удалить" }))) return;
    startDelete(async () => {
      await deleteJobLine(job.id);
      toast.success("Работа удалена");
    });
  }

  function update<K extends keyof RowDraft>(field: K, value: RowDraft[K]): void {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="jobLineId" value={job.id} />
      <RowFields
        index={index}
        draft={draft}
        totals={totals}
        canRemove
        onChange={update}
        onRemove={handleDelete}
        descriptionPlaceholder="Описание работы"
        removeDisabled={isDeleting}
      />
      {state?.error ? (
        <div className="mt-2">
          <Alert variant="error">{state.error}</Alert>
        </div>
      ) : null}
      <div className="mt-2 flex justify-end">
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
  index,
  onCancel,
  allowCancel,
}: {
  repairOrderId: string;
  index: number;
  onCancel: () => void;
  allowCancel: boolean;
}): React.ReactElement {
  const [state, formAction, isPending] = useActionState(addJobLine, null);
  const [draft, setDraft] = useState<RowDraft>({ ...EMPTY_DRAFT });
  const totals = computeTotal(draft);
  const descriptionRef = useRef<HTMLInputElement | null>(null);

  function update<K extends keyof RowDraft>(field: K, value: RowDraft[K]): void {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="repairOrderId" value={repairOrderId} />
      <RowFields
        index={index}
        draft={draft}
        totals={totals}
        canRemove={allowCancel}
        onChange={update}
        onRemove={onCancel}
        removeIcon="x"
        removeLabel="Отменить добавление"
        descriptionPlaceholder="Новая работа (например, замена колодок)"
        descriptionRef={descriptionRef}
      />
      {state?.error ? (
        <div className="mt-2">
          <Alert variant="error">{state.error}</Alert>
        </div>
      ) : null}
      <div className="mt-2 flex justify-end">
        <Button type="submit" size="sm" isLoading={isPending} disabled={isPending}>
          Добавить
        </Button>
      </div>
    </form>
  );
}

interface RowFieldsProps {
  index: number;
  draft: RowDraft;
  totals: { labor: number; parts: number; total: number };
  canRemove: boolean;
  onChange: <K extends keyof RowDraft>(field: K, value: RowDraft[K]) => void;
  onRemove: () => void;
  removeIcon?: "trash" | "x";
  removeLabel?: string;
  descriptionPlaceholder: string;
  descriptionRef?: React.RefObject<HTMLInputElement | null>;
  removeDisabled?: boolean;
}

/**
 * Single job-line row markup shared between create (EstimateBuilder
 * shape) and edit (JobLineEditor). White card surface so the cream
 * input fills stand out; two side-by-side fieldsets ("Работы" /
 * "Запчасти") with a single divider; tinted footer for the row total.
 */
function RowFields({
  index,
  draft,
  totals,
  canRemove,
  onChange,
  onRemove,
  removeIcon = "trash",
  removeLabel,
  descriptionPlaceholder,
  descriptionRef,
  removeDisabled,
}: RowFieldsProps): React.ReactElement {
  const RemoveIcon = removeIcon === "x" ? X : Trash2;
  const ariaRemove = removeLabel ?? `Удалить работу #${index + 1}`;
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
          value={draft.description}
          onChange={(e) => onChange("description", e.target.value)}
          className="input flex-1 text-sm"
          placeholder={descriptionPlaceholder}
          aria-label={`Описание работы #${index + 1}`}
          required
        />
        <select
          name="status"
          value={draft.status}
          onChange={(e) => onChange("status", e.target.value)}
          aria-label={`Статус работы #${index + 1}`}
          className="input w-auto text-xs py-2"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {JOB_LINE_STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </select>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={removeDisabled}
            className="btn-icon"
            aria-label={ariaRemove}
          >
            <RemoveIcon size={14} />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-y md:divide-y-0 divide-[var(--border)]">
        <RowSection title="Работы">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Часы"
              name="laborHours"
              type="number"
              step="0.25"
              min="0"
              inputMode="decimal"
              value={draft.laborHours}
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
              value={draft.laborRate}
              onChange={(e) => onChange("laborRate", e.target.value)}
              placeholder="0"
              className="job-line-num"
            />
          </div>
          <SectionTotal label="Сумма работ" value={totals.labor} />
        </RowSection>

        <RowSection title="Запчасти (опционально)">
          <Input
            label="Наименование"
            name="partDescription"
            value={draft.partDescription}
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
              value={draft.partQty}
              onChange={(e) => onChange("partQty", e.target.value)}
              className="job-line-num"
            />
            <Input
              label="Цена ₽"
              name="partUnitPrice"
              type="number"
              min="0"
              inputMode="numeric"
              value={draft.partUnitPrice}
              onChange={(e) => onChange("partUnitPrice", e.target.value)}
              placeholder="0"
              className="job-line-num"
            />
          </div>
          <SectionTotal label="Сумма запчастей" value={totals.parts} />
        </RowSection>
      </div>

      <div className="flex justify-between items-center px-4 py-3 border-t border-[var(--border)] bg-[var(--background-secondary)] text-sm">
        <span className="text-[var(--foreground-muted)]">Итого по работе</span>
        <span className="font-bold text-[var(--color-accent)]">
          {formatPrice(totals.total)}
        </span>
      </div>
    </div>
  );
}

function RowSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="p-4 space-y-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--foreground-muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function SectionTotal({
  label,
  value,
}: {
  label: string;
  value: number;
}): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between text-xs text-[var(--foreground-muted)]">
      <span>{label}</span>
      <span className="text-sm text-[var(--foreground)] font-medium tabular-nums">
        {formatPrice(value)}
      </span>
    </div>
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
    <div className="mt-2 pt-4 border-t border-[var(--border)] grid grid-cols-3 gap-4 text-sm">
      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
          Работы
        </div>
        <div className="mt-1">{formatPrice(labor)}</div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
          Запчасти
        </div>
        <div className="mt-1">{formatPrice(parts)}</div>
      </div>
      <div className="text-right">
        <div className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
          Итого
        </div>
        <div className="mt-1 text-lg font-bold text-[var(--color-accent)]">
          {formatPrice(total)}
        </div>
      </div>
    </div>
  );
}
