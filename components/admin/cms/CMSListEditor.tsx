"use client";

import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown, Trash2, Plus } from "lucide-react";
import { updateCMSBlock } from "@/app/actions/cms";
import { Button, Input, Textarea, Alert, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import type { CMSListField } from "@/lib/cms-schema";
import { useCMSSaveSection, type SaveResult } from "./CMSSaveContext";

interface CMSListEditorProps {
  schemaKey: string;
  label: string;
  fields: readonly CMSListField[];
  initial: Array<Record<string, string>>;
}

function emptyRowFor(fields: readonly CMSListField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.key] = "";
  return out;
}

export function CMSListEditor({
  schemaKey,
  label,
  fields,
  initial,
}: CMSListEditorProps): React.ReactElement {
  const [rows, setRows] = useState<Array<Record<string, string>>>(
    () => initial.map((r) => ({ ...r })),
  );
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { pending, error, runAction } = useFormAction();
  const section = useCMSSaveSection();

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  useEffect(() => {
    if (!section) return;
    const saver = async (): Promise<SaveResult> => {
      if (JSON.stringify(rows) === JSON.stringify(initial)) return { ok: true, saved: false };
      const res = await updateCMSBlock(schemaKey, { items: rows });
      if (!res.ok) return { ok: false, saved: false, error: res.error };
      return { ok: true, saved: true };
    };
    return section.registerSaver(schemaKey, saver);
  }, [section, schemaKey, rows, initial]);

  useEffect(() => {
    if (!section) return;
    section.reportDirty(schemaKey, dirty);
  }, [section, schemaKey, dirty]);

  function move(index: number, dir: -1 | 1): void {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = rows.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  function remove(index: number): void {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setPendingDelete(null);
  }

  function addRow(): void {
    setRows((prev) => [...prev, emptyRowFor(fields)]);
  }

  function updateField(rowIndex: number, fieldKey: string, value: string): void {
    setRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, [fieldKey]: value } : row)),
    );
  }

  function save(): void {
    runAction(async () => {
      const res = await updateCMSBlock(schemaKey, { items: rows });
      if (!res.ok) throw new Error(res.error);
      setSavedAt(Date.now());
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[10px] font-mono text-[var(--foreground-muted)]">
          {schemaKey}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)] italic">
            Список пуст. Добавьте первый пункт.
          </p>
        ) : null}

        {rows.map((row, i) => (
          <div
            key={i}
            className="border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--background-secondary)] p-3"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="text-xs font-mono text-[var(--foreground-muted)]">
                #{i + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Поднять выше"
                  className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronUp size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label="Опустить ниже"
                  className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDown size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(i)}
                  aria-label="Удалить пункт"
                  className="btn-icon text-[var(--color-error,#dc2626)]"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {fields.map((f) => {
                const inputId = `cms-${schemaKey.replace(/\./g, "-")}-${i}-${f.key}`;
                if (f.type === "richtext") {
                  return (
                    <Textarea
                      key={f.key}
                      id={inputId}
                      label={f.label}
                      rows={3}
                      value={row[f.key] ?? ""}
                      onChange={(e) => updateField(i, f.key, e.target.value)}
                    />
                  );
                }
                if (f.type === "color") {
                  return (
                    <div key={f.key} className="flex items-end gap-3">
                      <Input
                        id={inputId}
                        label={f.label}
                        type="color"
                        value={row[f.key] ?? "#000000"}
                        onChange={(e) => updateField(i, f.key, e.target.value)}
                        className="w-16 h-9 p-1"
                      />
                      <Input
                        aria-label={`${f.label} (HEX)`}
                        value={row[f.key] ?? ""}
                        onChange={(e) => updateField(i, f.key, e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  );
                }
                return (
                  <Input
                    key={f.key}
                    id={inputId}
                    label={f.label}
                    type={f.type === "url" ? "url" : "text"}
                    value={row[f.key] ?? ""}
                    onChange={(e) => updateField(i, f.key, e.target.value)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          <Plus size={14} className="mr-1.5" aria-hidden />
          Добавить
        </Button>
        {section ? null : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={save}
            isLoading={pending}
            disabled={!dirty}
          >
            {pending ? "Сохраняем..." : "Сохранить"}
          </Button>
        )}
        {section && dirty ? (
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-warning,#f59e0b)]">
            Не сохранено
          </span>
        ) : null}
        {!section && savedAt && !dirty && !error ? (
          <span className="text-xs text-[var(--color-success,#16a34a)]">Сохранено</span>
        ) : null}
        {!section && error ? <Alert variant="error">{error}</Alert> : null}
      </div>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить пункт?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--foreground-muted)]">
            Пункт #{pendingDelete !== null ? pendingDelete + 1 : ""} будет удалён
            из списка. Изменение применится после сохранения.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPendingDelete(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                if (pendingDelete !== null) remove(pendingDelete);
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
