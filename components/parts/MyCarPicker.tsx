"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import {
  generationLabel,
  modelDisplayName,
  trimLabel,
  type Trim,
  type VehicleModel,
} from "@/lib/vehicle-catalog-types";
import { setMyCar } from "@/lib/my-car-store";

interface Props {
  models: VehicleModel[];
}

/**
 * Three-step "my car" picker: Model → Generation → Trim. Receives the
 * trim-aware catalog as a prop from the page server component.
 *
 * All three dropdowns are always rendered so the funnel is discoverable.
 * Generation/trim are disabled until their parent step is picked. Trim
 * accepts "Не уверен" (the default-trim fallback) as a first-class option.
 *
 * Secondary actions next to "Применить":
 *   - "Знаю VIN" — placeholder for a future VIN-decoder shortcut
 *   - "Показать все запчасти для <model>" — bypass the trim filter via the
 *     existing `?showAll=1` flag handled in `app/(public)/parts/page.tsx`
 */
export function MyCarPicker({ models }: Props): React.ReactElement {
  const nav = useProgressRouter();
  const searchParams = useSearchParams();
  const [model, setModel] = useState<string>("");
  const [generation, setGeneration] = useState<string>("");
  const [trim, setTrim] = useState<string>("");

  const generations = useMemo(
    () => (model ? models.find((m) => m.name === model)?.generations ?? [] : []),
    [model, models],
  );
  const selectedGeneration = useMemo(
    () => generations.find((g) => g.code === generation),
    [generations, generation],
  );
  const trims: Trim[] = selectedGeneration?.trims ?? [];
  const trimDropdownEnabled = Boolean(selectedGeneration);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!model || !generation) return;
    const persistedTrim = trim || undefined;
    setMyCar({ model, generation, trim: persistedTrim });
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("model", model);
    newParams.set("generation", generation);
    if (persistedTrim) newParams.set("trim", persistedTrim);
    else newParams.delete("trim");
    newParams.delete("showAll");
    nav.push(`/parts?${newParams.toString()}`);
  }

  function handleShowAll(): void {
    if (!model) return;
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("model", model);
    newParams.set("showAll", "1");
    newParams.delete("generation");
    newParams.delete("trim");
    nav.push(`/parts?${newParams.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="card mb-6">
      <label className="block text-sm font-medium mb-1">
        Выберите свой автомобиль
      </label>
      <p className="text-xs text-[var(--foreground-muted)] mb-3">
        Покажем только подходящие запчасти
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        <select
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setGeneration("");
            setTrim("");
          }}
          className="input"
          aria-label="Модель"
        >
          <option value="">Модель</option>
          {models.map((m) => (
            <option key={m.slug} value={m.name}>
              {modelDisplayName(m.name)}
            </option>
          ))}
        </select>

        <select
          value={generation}
          onChange={(e) => {
            setGeneration(e.target.value);
            setTrim("");
          }}
          disabled={!model}
          className="input"
          aria-label="Поколение"
        >
          <option value="">
            {model ? "Поколение" : "Сначала выберите модель"}
          </option>
          {generations.map((g) => (
            <option key={g.code} value={g.code}>
              {generationLabel(g)}
            </option>
          ))}
        </select>

        <select
          value={trim}
          onChange={(e) => setTrim(e.target.value)}
          disabled={!trimDropdownEnabled}
          className="input"
          aria-label="Двигатель и комплектация"
        >
          <option value="">
            {trimDropdownEnabled
              ? "Не уверен"
              : generation
                ? "Нет вариантов"
                : "Сначала выберите поколение"}
          </option>
          {trims.map((t) => (
            <option key={t.id} value={t.id}>
              {trimLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-4 text-xs">
          <button
            type="button"
            disabled
            title="Скоро: подбор по VIN"
            className="text-[var(--foreground-muted)] cursor-not-allowed underline-offset-2"
          >
            Знаю VIN →
          </button>
          {model && (
            <button
              type="button"
              onClick={handleShowAll}
              className="text-[var(--color-accent)] hover:underline"
            >
              Показать все запчасти для {modelDisplayName(model)}
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!model || !generation}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Применить
        </button>
      </div>
    </form>
  );
}
