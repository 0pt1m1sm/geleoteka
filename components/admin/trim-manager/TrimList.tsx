"use client";

import { X } from "lucide-react";
import type { FuelType } from "@/lib/vehicle-catalog-types";
import { FUEL_OPTIONS, type TrimRow } from "./types";

interface TrimListProps {
  trims: TrimRow[];
  pending: boolean;
  onFieldUpdate: (
    id: string,
    field: keyof Omit<TrimRow, "id">,
    value: string | boolean | number | null,
  ) => void;
  onDeleteRequest: (trim: TrimRow) => void;
}

export function TrimList({
  trims,
  pending,
  onFieldUpdate,
  onDeleteRequest,
}: TrimListProps): React.ReactElement {
  return (
    <>
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
              if (e.target.value.trim() !== t.code) onFieldUpdate(t.id, "code", e.target.value);
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
                onFieldUpdate(t.id, "engineCode", e.target.value);
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
                onFieldUpdate(t.id, "drivetrain", e.target.value);
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
                onFieldUpdate(t.id, "bodyStyle", e.target.value);
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
              if (v !== t.fuelType) onFieldUpdate(t.id, "fuelType", v);
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
                onFieldUpdate(t.id, "displacementL", e.target.value || null);
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
                onFieldUpdate(t.id, "horsepower", n);
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
                onFieldUpdate(t.id, "notes", e.target.value);
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
              onChange={(e) => onFieldUpdate(t.id, "isActive", e.target.checked)}
              className="w-3.5 h-3.5 accent-[var(--color-accent)]"
            />
            Активен
          </label>
          <button
            type="button"
            onClick={() => onDeleteRequest(t)}
            disabled={pending}
            className="text-[var(--color-error)] hover:opacity-80 disabled:opacity-50 ml-auto"
            aria-label={`Удалить ${t.code}`}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </>
  );
}
