"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTrim, updateTrim, deleteTrim } from "@/app/actions/vehicle-catalog";
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

interface Props {
  generationId: string;
  generationCode: string;
  trims: TrimRow[];
}

interface DraftRow {
  code: string;
  bodyStyle: string;
  drivetrain: string;
  fuelType: "" | FuelType;
  engineCode: string;
  displacementL: string;
  horsepower: string;
  notes: string;
}

const EMPTY_DRAFT: DraftRow = {
  code: "",
  bodyStyle: "",
  drivetrain: "",
  fuelType: "",
  engineCode: "",
  displacementL: "",
  horsepower: "",
  notes: "",
};

const FUEL_OPTIONS: Array<{ value: "" | FuelType; label: string }> = [
  { value: "", label: "—" },
  { value: "PETROL", label: "Бензин" },
  { value: "DIESEL", label: "Дизель" },
  { value: "ELECTRIC", label: "Электро" },
  { value: "HYBRID", label: "Гибрид" },
];

export function TrimManager({ generationId, generationCode, trims }: Props): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRow>(EMPTY_DRAFT);

  function handleAdd(): void {
    setError(null);
    const code = draft.code.trim();
    if (!code) {
      setError("Код варианта обязателен (например G 63 AMG)");
      return;
    }
    const horsepower = draft.horsepower.trim() === "" ? null : parseInt(draft.horsepower, 10);
    if (horsepower !== null && (!Number.isFinite(horsepower) || horsepower < 0)) {
      setError("Мощность должна быть положительным числом");
      return;
    }
    const displacement = draft.displacementL.trim() === "" ? null : draft.displacementL.trim();
    if (displacement !== null && !Number.isFinite(parseFloat(displacement))) {
      setError("Объём двигателя должен быть числом (например 4.0)");
      return;
    }

    startTransition(async () => {
      try {
        await createTrim({
          generationId,
          code,
          bodyStyle: draft.bodyStyle.trim() || null,
          drivetrain: draft.drivetrain.trim() || null,
          fuelType: draft.fuelType === "" ? null : draft.fuelType,
          engineCode: draft.engineCode.trim() || null,
          displacementL: displacement,
          horsepower,
          notes: draft.notes.trim() || null,
        });
        setDraft(EMPTY_DRAFT);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка создания варианта");
      }
    });
  }

  function handleFieldUpdate(
    id: string,
    field: keyof Omit<TrimRow, "id">,
    value: string | boolean | number | null,
  ): void {
    setError(null);
    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {};
        payload[field] = value;
        await updateTrim(id, payload as Parameters<typeof updateTrim>[1]);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка обновления");
      }
    });
  }

  function handleDelete(t: TrimRow): void {
    if (!confirm(`Удалить вариант "${t.code}"?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteTrim(t.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка удаления");
      }
    });
  }

  return (
    <details className="rounded-lg border border-[var(--border)]/60 bg-[var(--background-secondary)]/40">
      <summary className="cursor-pointer px-3 py-2 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
        + {trims.length > 0 ? `${trims.length} вариантов` : "Добавить варианты"} ({generationCode})
      </summary>
      <div className="space-y-3 px-3 pb-3 pt-1">
        {error && (
          <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-3 py-2 rounded text-xs">
            {error}
          </div>
        )}

        {trims.length === 0 && (
          <p className="text-xs text-[var(--foreground-muted)] py-1">
            Нет вариантов — клиенты увидят только «Все варианты» в фильтре.
          </p>
        )}

        {trims.map((t) => (
          <div
            key={t.id}
            className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 rounded border border-[var(--border)] p-2"
          >
            <input
              type="text"
              defaultValue={t.code}
              onBlur={(e) => {
                if (e.target.value.trim() !== t.code) handleFieldUpdate(t.id, "code", e.target.value);
              }}
              className="input text-xs col-span-2 sm:col-span-1"
              placeholder="G 63 AMG"
              aria-label="Код варианта"
            />
            <input
              type="text"
              defaultValue={t.engineCode ?? ""}
              onBlur={(e) => {
                if (e.target.value.trim() !== (t.engineCode ?? "")) {
                  handleFieldUpdate(t.id, "engineCode", e.target.value);
                }
              }}
              className="input text-xs font-mono"
              placeholder="M177"
              aria-label="Код двигателя"
            />
            <input
              type="text"
              defaultValue={t.drivetrain ?? ""}
              onBlur={(e) => {
                if (e.target.value.trim() !== (t.drivetrain ?? "")) {
                  handleFieldUpdate(t.id, "drivetrain", e.target.value);
                }
              }}
              className="input text-xs"
              placeholder="4MATIC"
              aria-label="Привод"
            />
            <input
              type="text"
              defaultValue={t.bodyStyle ?? ""}
              onBlur={(e) => {
                if (e.target.value.trim() !== (t.bodyStyle ?? "")) {
                  handleFieldUpdate(t.id, "bodyStyle", e.target.value);
                }
              }}
              className="input text-xs"
              placeholder="long"
              aria-label="Кузов"
            />
            <select
              defaultValue={t.fuelType ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : (e.target.value as FuelType);
                if (v !== t.fuelType) handleFieldUpdate(t.id, "fuelType", v);
              }}
              className="input text-xs"
              aria-label="Топливо"
            >
              {FUEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.1"
              defaultValue={t.displacementL ?? ""}
              onBlur={(e) => {
                const cur = t.displacementL ?? "";
                if (e.target.value !== cur) {
                  handleFieldUpdate(t.id, "displacementL", e.target.value || null);
                }
              }}
              className="input text-xs"
              placeholder="4.0"
              aria-label="Объём (л)"
            />
            <input
              type="number"
              defaultValue={t.horsepower ?? ""}
              onBlur={(e) => {
                const cur = t.horsepower === null ? "" : String(t.horsepower);
                if (e.target.value !== cur) {
                  const n = e.target.value === "" ? null : parseInt(e.target.value, 10);
                  handleFieldUpdate(t.id, "horsepower", n);
                }
              }}
              className="input text-xs"
              placeholder="585"
              aria-label="Мощность (л.с.)"
            />
            <input
              type="text"
              defaultValue={t.notes ?? ""}
              onBlur={(e) => {
                if (e.target.value.trim() !== (t.notes ?? "")) {
                  handleFieldUpdate(t.id, "notes", e.target.value);
                }
              }}
              className="input text-xs col-span-2 sm:col-span-3 lg:col-span-5"
              placeholder="Заметки"
              aria-label="Заметки"
            />
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={t.isActive}
                onChange={(e) => handleFieldUpdate(t.id, "isActive", e.target.checked)}
                className="w-3.5 h-3.5 accent-[var(--color-accent)]"
              />
              Активен
            </label>
            <button
              type="button"
              onClick={() => handleDelete(t)}
              disabled={pending}
              className="text-xs text-[var(--color-error)] hover:opacity-80 ml-auto"
              aria-label={`Удалить ${t.code}`}
            >
              ×
            </button>
          </div>
        ))}

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 rounded border border-dashed border-[var(--border)] p-2">
          <input
            type="text"
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            className="input text-xs col-span-2 sm:col-span-1"
            placeholder="G 63 AMG"
            aria-label="Новый код"
          />
          <input
            type="text"
            value={draft.engineCode}
            onChange={(e) => setDraft({ ...draft, engineCode: e.target.value })}
            className="input text-xs font-mono"
            placeholder="M177"
            aria-label="Двигатель"
          />
          <input
            type="text"
            value={draft.drivetrain}
            onChange={(e) => setDraft({ ...draft, drivetrain: e.target.value })}
            className="input text-xs"
            placeholder="4MATIC"
            aria-label="Привод"
          />
          <input
            type="text"
            value={draft.bodyStyle}
            onChange={(e) => setDraft({ ...draft, bodyStyle: e.target.value })}
            className="input text-xs"
            placeholder="long"
            aria-label="Кузов"
          />
          <select
            value={draft.fuelType}
            onChange={(e) => setDraft({ ...draft, fuelType: e.target.value as DraftRow["fuelType"] })}
            className="input text-xs"
            aria-label="Топливо"
          >
            {FUEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.1"
            value={draft.displacementL}
            onChange={(e) => setDraft({ ...draft, displacementL: e.target.value })}
            className="input text-xs"
            placeholder="4.0"
            aria-label="Объём (л)"
          />
          <input
            type="number"
            value={draft.horsepower}
            onChange={(e) => setDraft({ ...draft, horsepower: e.target.value })}
            className="input text-xs"
            placeholder="585"
            aria-label="Мощность"
          />
          <input
            type="text"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            className="input text-xs col-span-2 sm:col-span-3 lg:col-span-5"
            placeholder="Заметки"
            aria-label="Заметки"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending}
            className="btn btn-primary text-xs ml-auto col-span-2 lg:col-span-1 disabled:opacity-50"
          >
            + Добавить
          </button>
        </div>
      </div>
    </details>
  );
}
