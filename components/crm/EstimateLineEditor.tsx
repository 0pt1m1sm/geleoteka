"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import {
  addEstimateLine,
  deleteEstimateLine,
  updateEstimateLine,
} from "@/app/actions/crm/estimate-lines";
import { DEAL_LINE_TYPE_LABELS } from "@/lib/deal-stage-labels";
import { formatPrice } from "@/lib/utils";

interface EstimateLineView {
  id: string;
  type: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
  sortOrder: number;
}

interface Props {
  estimateId: string;
  initialLines: EstimateLineView[];
  editable: boolean;
}

const LINE_TYPES = ["LABOR", "PART", "RENTAL_DAY", "DISCOUNT", "FEE"];

interface Draft {
  type: string;
  description: string;
  qty: string;
  unitPrice: string;
}

const EMPTY: Draft = { type: "LABOR", description: "", qty: "1", unitPrice: "" };

function draftFrom(line: EstimateLineView): Draft {
  return {
    type: line.type,
    description: line.description,
    qty: String(line.qty),
    unitPrice: String(Math.abs(line.unitPrice)),
  };
}

function rowTotal(d: Draft): number {
  const qty = Number.parseFloat(d.qty) || 0;
  const price = Number.parseInt(d.unitPrice, 10) || 0;
  const signed = d.type === "DISCOUNT" ? -Math.abs(price) : Math.abs(price);
  return Math.round(qty * signed);
}

/**
 * DRAFT-only line editor for an Estimate. Mirrors DealLineEditor — the
 * two are deliberately separate components so they can diverge as
 * estimate-side rules evolve (e.g. supersede-on-edit semantics that the
 * deal side will never need).
 *
 * Edits write to EstimateLine only; the parent Deal and its DealLine[]
 * are untouched (snapshot contract).
 */
export function EstimateLineEditor({
  estimateId,
  initialLines,
  editable,
}: Props): React.ReactElement {
  const [showAdd, setShowAdd] = useState(initialLines.length === 0 && editable);

  return (
    <div className="space-y-4">
      {initialLines.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          {editable ? "В смете ещё нет позиций." : "Смета пуста."}
        </p>
      ) : (
        <ul className="space-y-3">
          {initialLines.map((line, i) => (
            <li key={line.id}>
              {editable ? (
                <EditRow line={line} index={i} />
              ) : (
                <ReadOnlyRow line={line} index={i} />
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && showAdd ? (
        <AddRow
          estimateId={estimateId}
          index={initialLines.length}
          onCancel={() => setShowAdd(false)}
          allowCancel={initialLines.length > 0}
        />
      ) : editable ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={() => setShowAdd(true)}
        >
          Добавить строку
        </Button>
      ) : null}
    </div>
  );
}

function EditRow({
  line,
  index,
}: {
  line: EstimateLineView;
  index: number;
}): React.ReactElement {
  const [state, formAction, isPending] = useActionState(updateEstimateLine, null);
  const [isDeleting, startDelete] = useTransition();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(line));
  const total = rowTotal(draft);

  function update<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleDelete(): void {
    if (!confirm("Удалить строку?")) return;
    startDelete(async () => {
      await deleteEstimateLine(line.id);
    });
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="estimateLineId" value={line.id} />
      <RowFields
        index={index}
        draft={draft}
        rowTotal={total}
        canRemove
        onChange={update}
        onRemove={handleDelete}
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

function AddRow({
  estimateId,
  index,
  onCancel,
  allowCancel,
}: {
  estimateId: string;
  index: number;
  onCancel: () => void;
  allowCancel: boolean;
}): React.ReactElement {
  const [state, formAction, isPending] = useActionState(addEstimateLine, null);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY });
  const total = rowTotal(draft);
  const descRef = useRef<HTMLInputElement | null>(null);

  function update<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="estimateId" value={estimateId} />
      <RowFields
        index={index}
        draft={draft}
        rowTotal={total}
        canRemove={allowCancel}
        onChange={update}
        onRemove={onCancel}
        removeIcon="x"
        removeLabel="Отменить добавление"
        descriptionRef={descRef}
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

function ReadOnlyRow({
  line,
  index,
}: {
  line: EstimateLineView;
  index: number;
}): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 flex items-center gap-3">
      <span className="text-xs font-mono text-[var(--foreground-muted)] shrink-0">
        #{index + 1}
      </span>
      <span className="text-xs text-[var(--foreground-muted)] shrink-0 w-24">
        {DEAL_LINE_TYPE_LABELS[line.type] ?? line.type}
      </span>
      <span className="flex-1 truncate text-sm">{line.description}</span>
      <span className="text-xs text-[var(--foreground-muted)] tabular-nums">
        {line.qty} × {formatPrice(line.unitPrice)}
      </span>
      <span className="text-sm font-medium text-[var(--color-accent)] tabular-nums w-24 text-right">
        {formatPrice(line.total)}
      </span>
    </div>
  );
}

interface RowFieldsProps {
  index: number;
  draft: Draft;
  rowTotal: number;
  canRemove: boolean;
  onChange: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  onRemove: () => void;
  removeIcon?: "trash" | "x";
  removeLabel?: string;
  removeDisabled?: boolean;
  descriptionRef?: React.RefObject<HTMLInputElement | null>;
}

function RowFields({
  index,
  draft,
  rowTotal,
  canRemove,
  onChange,
  onRemove,
  removeIcon = "trash",
  removeLabel,
  removeDisabled,
  descriptionRef,
}: RowFieldsProps): React.ReactElement {
  const RemoveIcon = removeIcon === "x" ? X : Trash2;
  const ariaRemove = removeLabel ?? `Удалить строку #${index + 1}`;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <span
          className="shrink-0 text-xs font-mono text-[var(--foreground-muted)]"
          aria-hidden
        >
          #{index + 1}
        </span>
        <select
          name="type"
          value={draft.type}
          onChange={(e) => onChange("type", e.target.value)}
          aria-label="Тип строки"
          className="input w-auto text-xs py-2"
        >
          {LINE_TYPES.map((t) => (
            <option key={t} value={t}>
              {DEAL_LINE_TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>
        <input
          ref={descriptionRef ?? undefined}
          name="description"
          value={draft.description}
          onChange={(e) => onChange("description", e.target.value)}
          className="input flex-1 text-sm"
          placeholder="Например: замена тормозных колодок"
          aria-label="Описание"
          required
        />
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

      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input
          label={draft.type === "LABOR" ? "Часы" : draft.type === "RENTAL_DAY" ? "Дни" : "Кол-во"}
          name="qty"
          type="number"
          step="0.25"
          min="0"
          inputMode="decimal"
          value={draft.qty}
          onChange={(e) => onChange("qty", e.target.value)}
          className="job-line-num"
        />
        <Input
          label={draft.type === "LABOR" ? "Ставка ₽/ч" : "Цена ₽"}
          name="unitPrice"
          type="number"
          inputMode="numeric"
          value={draft.unitPrice}
          onChange={(e) => onChange("unitPrice", e.target.value)}
          placeholder="0"
          className="job-line-num"
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Сумма строки</span>
          <span className="input flex items-center justify-end font-medium text-[var(--color-accent)] tabular-nums">
            {formatPrice(rowTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
