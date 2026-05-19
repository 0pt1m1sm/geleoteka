"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import {
  addEstimateLine,
  deleteEstimateLine,
  updateEstimateLine,
} from "@/app/actions/crm/estimate-lines";
import { DEAL_LINE_TYPE_LABELS } from "@/lib/deal-stage-labels";
import { formatPrice } from "@/lib/utils";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

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
// 400ms is fast enough that totals reflect typing within one breath, slow
// enough that a 4-keystroke price entry collapses into one request.
const SAVE_DEBOUNCE_MS = 400;

interface Draft {
  type: string;
  description: string;
  qty: string;
  unitPrice: string;
}

interface LiveLineTotals {
  type: string;
  total: number;
}

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

type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";

/**
 * DRAFT-only line editor for an Estimate. Every change to a row is
 * debounced-autosaved (~800ms after the last keystroke). A compact status
 * indicator at the top of the editor surfaces in-flight / saved / error
 * states — no per-row Save buttons.
 *
 * Add and delete are still single-shot transitions.
 */
export function EstimateLineEditor({
  estimateId,
  initialLines,
  editable,
}: Props): React.ReactElement {
  const [rowStatuses, setRowStatuses] = useState<Map<string, SaveStatus>>(
    new Map(),
  );
  // Live per-row totals reported up from EditRow on every keystroke. Used
  // for the running totals strip so the running sums update instantly —
  // independent of the debounced server save + router.refresh round trip
  // (which previously meant rows 2+ "didn't count" until something else
  // forced a refresh).
  const [liveTotals, setLiveTotals] = useState<Map<string, LiveLineTotals>>(
    () => new Map(initialLines.map((l) => [l.id, { type: l.type, total: l.total }])),
  );

  function reportRowStatus(id: string, status: SaveStatus): void {
    setRowStatuses((prev) => {
      const next = new Map(prev);
      if (status === "clean") next.delete(id);
      else next.set(id, status);
      return next;
    });
  }

  function reportRowTotal(id: string, totals: LiveLineTotals): void {
    setLiveTotals((prev) => {
      const existing = prev.get(id);
      if (existing && existing.type === totals.type && existing.total === totals.total) {
        return prev;
      }
      const next = new Map(prev);
      next.set(id, totals);
      return next;
    });
  }

  const aggregate = aggregateStatus(rowStatuses);

  // Live aggregate from current drafts — independent of server-side
  // recompute. Filters by id present in initialLines so a row deleted
  // mid-session drops out immediately rather than waiting for refresh.
  const validIds = new Set(initialLines.map((l) => l.id));
  const liveSubtotals = (() => {
    let labor = 0;
    let parts = 0;
    let rental = 0;
    let discount = 0;
    let total = 0;
    for (const [id, t] of liveTotals) {
      if (!validIds.has(id)) continue;
      total += t.total;
      if (t.type === "LABOR") labor += t.total;
      else if (t.type === "PART") parts += t.total;
      else if (t.type === "RENTAL_DAY") rental += t.total;
      else if (t.type === "DISCOUNT") discount += t.total;
    }
    return { labor, parts, rental, discount, total };
  })();

  return (
    <div className="space-y-4">
      {editable ? <StatusBadge status={aggregate} /> : null}

      {initialLines.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          {editable ? "В смете ещё нет позиций — нажмите «Добавить строку»." : "Смета пуста."}
        </p>
      ) : (
        <ul className="space-y-3">
          {initialLines.map((line, i) => (
            <li key={line.id}>
              {editable ? (
                <EditRow
                  line={line}
                  index={i}
                  onStatusChange={(s) => reportRowStatus(line.id, s)}
                  onTotalChange={(t) => reportRowTotal(line.id, t)}
                />
              ) : (
                <ReadOnlyRow line={line} index={i} />
              )}
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <>
          <LiveTotalsStrip subtotals={liveSubtotals} pending={rowStatuses.size > 0} />
          <AddLineButton estimateId={estimateId} />
        </>
      ) : null}
    </div>
  );
}

function LiveTotalsStrip({
  subtotals,
  pending,
}: {
  subtotals: { labor: number; parts: number; rental: number; discount: number; total: number };
  pending: boolean;
}): React.ReactElement {
  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background-secondary)] px-4 py-3 space-y-1 text-sm"
      aria-live="polite"
    >
      <div className="flex justify-between text-[var(--foreground-muted)]">
        <span>Работы</span>
        <span className="tabular-nums">{formatPrice(subtotals.labor)}</span>
      </div>
      <div className="flex justify-between text-[var(--foreground-muted)]">
        <span>Запчасти</span>
        <span className="tabular-nums">{formatPrice(subtotals.parts)}</span>
      </div>
      {subtotals.rental ? (
        <div className="flex justify-between text-[var(--foreground-muted)]">
          <span>Аренда</span>
          <span className="tabular-nums">{formatPrice(subtotals.rental)}</span>
        </div>
      ) : null}
      {subtotals.discount ? (
        <div className="flex justify-between text-[var(--foreground-muted)]">
          <span>Скидки</span>
          <span className="tabular-nums">{formatPrice(subtotals.discount)}</span>
        </div>
      ) : null}
      <div className="flex justify-between items-baseline pt-2 border-t border-[var(--border)]">
        <span className="font-medium flex items-center gap-2">
          Итого
          {pending ? (
            <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-normal">
              сохраняем…
            </span>
          ) : null}
        </span>
        <span className="text-lg font-bold text-[var(--color-accent)] tabular-nums">
          {formatPrice(subtotals.total)}
        </span>
      </div>
    </div>
  );
}

function aggregateStatus(statuses: Map<string, SaveStatus>): SaveStatus {
  if (statuses.size === 0) return "clean";
  const vals = Array.from(statuses.values());
  if (vals.includes("error")) return "error";
  if (vals.includes("saving")) return "saving";
  if (vals.includes("dirty")) return "dirty";
  if (vals.includes("saved")) return "saved";
  return "clean";
}

function StatusBadge({ status }: { status: SaveStatus }): React.ReactElement | null {
  if (status === "clean") return null;
  const config = {
    dirty: { Icon: Loader2, text: "Не сохранено", className: "text-[var(--foreground-muted)]" },
    saving: { Icon: Loader2, text: "Сохраняем…", className: "text-[var(--foreground-muted)] animate-pulse" },
    saved: { Icon: Check, text: "Сохранено", className: "text-[var(--color-accent)]" },
    error: { Icon: TriangleAlert, text: "Ошибка сохранения", className: "text-[var(--color-error)]" },
  }[status];
  return (
    <div className={`flex items-center gap-1.5 text-xs ${config.className}`} role="status">
      <config.Icon size={12} aria-hidden />
      <span>{config.text}</span>
    </div>
  );
}

function EditRow({
  line,
  index,
  onStatusChange,
  onTotalChange,
}: {
  line: EstimateLineView;
  index: number;
  onStatusChange: (s: SaveStatus) => void;
  onTotalChange: (t: LiveLineTotals) => void;
}): React.ReactElement {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(line));
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const lastSavedRef = useRef<Draft>(draftFrom(line));
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Report live row total upward on every draft change so the editor's
  // running totals strip reflects what the user just typed — independent
  // of the debounced server save.
  useEffect(() => {
    onTotalChange({ type: draft.type, total: rowTotal(draft) });
    // onTotalChange identity is stable across renders for our use; we don't
    // want it triggering re-fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Re-sync local draft when the parent re-fetches (e.g. after add/delete).
  // Avoid clobbering edits-in-flight: only reset when the prop changes AND
  // the local draft matches the last known saved state.
  useEffect(() => {
    if (!isDraftDirty(draft, lastSavedRef.current)) {
      const fresh = draftFrom(line);
      setDraft(fresh);
      lastSavedRef.current = fresh;
    }
    // We only care about line.id stability — qty/price refresh shouldn't fight
    // the user's in-flight edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id]);

  // Debounced auto-save: whenever draft differs from last-saved, schedule a
  // save 800ms after the most recent keystroke.
  useEffect(() => {
    if (!isDraftDirty(draft, lastSavedRef.current)) return;

    if (!draft.description.trim()) {
      // Empty description is invalid — server would reject. Stay dirty
      // silently; once the user fills it in we'll attempt.
      onStatusChange("dirty");
      return;
    }

    onStatusChange("dirty");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void doSave();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // doSave is a stable inline closure; we intentionally don't depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  async function doSave(): Promise<void> {
    if (inFlightRef.current) {
      // Another save already mid-flight; schedule a retry after it returns
      // by leaving the timer null — the next keystroke will re-arm it.
      return;
    }
    inFlightRef.current = true;
    onStatusChange("saving");
    setError(null);
    try {
      const fd = new FormData();
      fd.set("estimateLineId", line.id);
      fd.set("description", draft.description);
      fd.set("type", draft.type);
      fd.set("qty", draft.qty);
      fd.set("unitPrice", draft.unitPrice);
      const result = await updateEstimateLine(null, fd);
      if (result.error) {
        setError(result.error);
        onStatusChange("error");
        return;
      }
      lastSavedRef.current = { ...draft };
      onStatusChange("saved");
      // Brief "Сохранено" flash, then clean.
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
      savedFlashRef.current = setTimeout(() => onStatusChange("clean"), 1500);
      // Re-fetch parent so totals stay accurate; debounce-friendly because
      // recomputeDealTotals cascades.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
      onStatusChange("error");
    } finally {
      inFlightRef.current = false;
    }
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleDelete(): Promise<void> {
    const ok = await confirm({
      message: "Удалить строку?",
      danger: true,
      confirmText: "Удалить",
    });
    if (!ok) return;
    startDelete(async () => {
      onStatusChange("clean");
      const result = await deleteEstimateLine(line.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Строка удалена");
      router.refresh();
    });
  }

  return (
    <div>
      <RowFields
        index={index}
        draft={draft}
        rowTotal={rowTotal(draft)}
        canRemove
        onChange={update}
        onRemove={handleDelete}
        removeDisabled={isDeleting}
      />
      {error ? (
        <div className="mt-2">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}
    </div>
  );
}

function isDraftDirty(a: Draft, b: Draft): boolean {
  return (
    a.type !== b.type ||
    a.description !== b.description ||
    a.qty !== b.qty ||
    a.unitPrice !== b.unitPrice
  );
}

function AddLineButton({ estimateId }: { estimateId: string }): React.ReactElement {
  const router = useRouter();
  const [pending, startAdd] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd(): void {
    setError(null);
    startAdd(async () => {
      const fd = new FormData();
      fd.set("estimateId", estimateId);
      fd.set("type", "LABOR");
      fd.set("description", "Новая позиция");
      fd.set("qty", "1");
      fd.set("unitPrice", "0");
      const result = await addEstimateLine(null, fd);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Строка добавлена");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leftIcon={<Plus size={14} />}
        onClick={handleAdd}
        isLoading={pending}
        disabled={pending}
      >
        Добавить строку
      </Button>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
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
  removeDisabled?: boolean;
}

function RowFields({
  index,
  draft,
  rowTotal,
  canRemove,
  onChange,
  onRemove,
  removeDisabled,
}: RowFieldsProps): React.ReactElement {
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
            data-loading={removeDisabled || undefined}
            aria-busy={removeDisabled || undefined}
            className="btn-icon"
            aria-label={`Удалить строку #${index + 1}`}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input
          label={draft.type === "LABOR" ? "Часы" : draft.type === "RENTAL_DAY" ? "Дни" : "Кол-во"}
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
