"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createGeneration,
  updateGeneration,
  deleteGeneration,
} from "@/app/actions/vehicle-catalog";
import { useFormAction } from "@/lib/use-form-action";
import { TrimManager } from "./TrimManager";
import type { FuelType } from "@/lib/vehicle-catalog-types";

interface TrimRow {
  id: string;
  code: string;
  bodyStyle: string | null;
  drivetrain: string | null;
  fuelType: FuelType | null;
  engineCode: string | null;
  displacementL: string | null;
  horsepower: number | null;
  notes: string | null;
  isActive: boolean;
}

interface Generation {
  id: string;
  code: string;
  yearFrom: number;
  yearTo: number | null;
  isActive: boolean;
  trims: TrimRow[];
}

interface Props {
  modelId: string;
  generations: Generation[];
}

interface DraftRow {
  code: string;
  yearFrom: string;
  yearTo: string;
}

const EMPTY_DRAFT: DraftRow = { code: "", yearFrom: "", yearTo: "" };

export function GenerationManager({ modelId, generations }: Props): React.ReactElement {
  const router = useRouter();
  const { pending, error, setError, runAction } = useFormAction();
  const [draft, setDraft] = useState<DraftRow>(EMPTY_DRAFT);

  function handleAdd(): void {
    setError(null);
    const code = draft.code.trim();
    const yearFrom = parseInt(draft.yearFrom);
    const yearTo = draft.yearTo.trim() === "" ? null : parseInt(draft.yearTo);

    if (!code) {
      setError("Шасси-код обязателен (например W463A)");
      return;
    }
    if (!Number.isFinite(yearFrom) || yearFrom < 1900 || yearFrom > 2100) {
      setError("Введите корректный год начала");
      return;
    }
    if (yearTo !== null && (!Number.isFinite(yearTo) || yearTo < yearFrom)) {
      setError("Год окончания должен быть пустым или ≥ года начала");
      return;
    }

    runAction(async () => {
      await createGeneration({ modelId, code, yearFrom, yearTo });
      setDraft(EMPTY_DRAFT);
      router.refresh();
    });
  }

  function handleUpdate(
    id: string,
    field: "code" | "yearFrom" | "yearTo" | "isActive",
    value: string | boolean,
  ): void {
    runAction(async () => {
      if (field === "isActive") {
        await updateGeneration(id, { isActive: value as boolean });
      } else if (field === "code") {
        await updateGeneration(id, { code: value as string });
      } else if (field === "yearFrom") {
        const n = parseInt(value as string);
        if (Number.isFinite(n)) await updateGeneration(id, { yearFrom: n });
      } else if (field === "yearTo") {
        const v = value as string;
        const n = v.trim() === "" ? null : parseInt(v);
        await updateGeneration(id, { yearTo: n });
      }
      router.refresh();
    });
  }

  function handleDelete(g: Generation): void {
    if (!confirm(`Удалить поколение "${g.code} (${g.yearFrom}–${g.yearTo ?? "н.в."})"?`)) return;
    runAction(async () => {
      await deleteGeneration(g.id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {generations.length === 0 && (
          <p className="text-sm text-[var(--foreground-muted)] py-2">
            Поколения не добавлены. Используйте форму ниже.
          </p>
        )}
        {generations.map((g) => (
          <div
            key={g.id}
            className="space-y-2 rounded-lg border border-[var(--border)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                defaultValue={g.code}
                onBlur={(e) => {
                  if (e.target.value.trim() !== g.code) handleUpdate(g.id, "code", e.target.value);
                }}
                className="input font-mono text-sm w-24"
                aria-label="Шасси-код"
              />
              <span className="text-xs text-[var(--foreground-muted)]">с</span>
              <input
                type="number"
                defaultValue={g.yearFrom}
                onBlur={(e) => {
                  if (parseInt(e.target.value) !== g.yearFrom) handleUpdate(g.id, "yearFrom", e.target.value);
                }}
                className="input text-sm w-24"
                min={1900}
                max={2100}
                aria-label="Год начала"
              />
              <span className="text-xs text-[var(--foreground-muted)]">по</span>
              <input
                type="number"
                defaultValue={g.yearTo ?? ""}
                onBlur={(e) => {
                  const cur = g.yearTo === null ? "" : String(g.yearTo);
                  if (e.target.value !== cur) handleUpdate(g.id, "yearTo", e.target.value);
                }}
                className="input text-sm w-24"
                min={1900}
                max={2100}
                placeholder="н.в."
                aria-label="Год окончания (пусто = по сей день)"
              />
              <label className="flex items-center gap-2 ml-auto text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={g.isActive}
                  onChange={(e) => handleUpdate(g.id, "isActive", e.target.checked)}
                  className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                />
                Активно
              </label>
              <button
                type="button"
                onClick={() => handleDelete(g)}
                disabled={pending}
                className="text-xs text-[var(--color-error)] hover:opacity-80"
                aria-label={`Удалить ${g.code}`}
              >
                ×
              </button>
            </div>
            <TrimManager generationId={g.id} generationCode={g.code} trims={g.trims} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--border)] p-3">
        <input
          type="text"
          value={draft.code}
          onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          className="input font-mono text-sm w-24"
          placeholder="W463A"
          aria-label="Новый шасси-код"
        />
        <span className="text-xs text-[var(--foreground-muted)]">с</span>
        <input
          type="number"
          value={draft.yearFrom}
          onChange={(e) => setDraft({ ...draft, yearFrom: e.target.value })}
          className="input text-sm w-24"
          min={1900}
          max={2100}
          placeholder="2018"
          aria-label="Год начала"
        />
        <span className="text-xs text-[var(--foreground-muted)]">по</span>
        <input
          type="number"
          value={draft.yearTo}
          onChange={(e) => setDraft({ ...draft, yearTo: e.target.value })}
          className="input text-sm w-24"
          min={1900}
          max={2100}
          placeholder="н.в."
          aria-label="Год окончания"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending}
          className="btn btn-primary text-xs ml-auto disabled:opacity-50"
        >
          + Добавить
        </button>
      </div>
    </div>
  );
}
