"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  generationLabel,
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
 * The trim dropdown only appears when the chosen generation has at least one
 * curated (non-default) trim. "Не уверен" is the always-on fallback that
 * filters at generation level (matching pre-trim behaviour).
 */
export function MyCarPicker({ models }: Props): React.ReactElement {
  const router = useRouter();
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
  const hasTrims = trims.length > 0;

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
    router.push(`/parts?${newParams.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card mb-6 flex flex-col sm:flex-row sm:items-end gap-3"
    >
      <div className="flex-1">
        <label className="block text-sm font-medium mb-1">
          Выберите свой автомобиль
        </label>
        <p className="text-xs text-[var(--foreground-muted)] mb-2">
          Покажем только подходящие запчасти
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setGeneration("");
              setTrim("");
            }}
            className="input flex-1"
            aria-label="Модель"
          >
            <option value="">Модель</option>
            {models.map((m) => (
              <option key={m.slug} value={m.name}>
                {m.name}
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
            className="input flex-1"
            aria-label="Поколение"
          >
            <option value="">{model ? "Поколение" : "Сначала модель"}</option>
            {generations.map((g) => (
              <option key={g.code} value={g.code}>
                {generationLabel(g)}
              </option>
            ))}
          </select>
          {generation && hasTrims && (
            <select
              value={trim}
              onChange={(e) => setTrim(e.target.value)}
              className="input flex-1"
              aria-label="Вариант (двигатель/привод)"
            >
              <option value="">Не уверен</option>
              {trims.map((t) => (
                <option key={t.id} value={t.id}>
                  {trimLabel(t)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <button
        type="submit"
        disabled={!model || !generation}
        className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Применить
      </button>
    </form>
  );
}
