"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { generationLabel, type VehicleModel } from "@/lib/models-data";
import { setMyCar } from "@/lib/my-car-store";

interface Props {
  models: VehicleModel[];
}

/**
 * Two-step "my car" picker: Model + Generation. Receives the catalog as a
 * prop from the page server component (the data lives in the DB now).
 * Submit writes localStorage AND pushes the picker's keys into the URL so
 * SSR applies the compatibility filter on first paint.
 */
export function MyCarPicker({ models }: Props): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [model, setModel] = useState<string>("");
  const [generation, setGeneration] = useState<string>("");

  const generations = model
    ? models.find((m) => m.name === model)?.generations ?? []
    : [];

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!model || !generation) return;
    setMyCar({ model, generation });
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("model", model);
    newParams.set("generation", generation);
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
            onChange={(e) => setGeneration(e.target.value)}
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
