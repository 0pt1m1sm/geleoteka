"use client";

import { useState } from "react";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";

export interface GenerationOption {
  code: string;
  yearFrom: number;
  yearTo: number | null;
}

export interface ModelFilterOption {
  slug: string;
  name: string;
  generations: GenerationOption[];
}

export interface GroupFilterOption {
  key: string;
  label: string;
  count: number;
}

interface Selection {
  model: string;
  gen: string;
  group: string;
  q: string;
}

/**
 * Каскадные фильтры справочника: модель → кузов/годы (из каталога машин) →
 * агрегат (селект со счётчиками — чипсы не масштабируются по числу групп),
 * плюс текстовый поиск. Меняет URL (router.push) — список рендерит сервер.
 * Смена модели сбрасывает кузов; агрегат сохраняется до «Сбросить».
 */
export function PartRefFilterBar({
  models,
  groups,
  totalInBase,
  initial,
}: {
  models: ModelFilterOption[];
  /** Агрегаты со счётчиками в разрезе выбранных модели/кузова/поиска. */
  groups: GroupFilterOption[];
  totalInBase: number;
  initial: Selection;
}): React.ReactElement {
  const nav = useProgressRouter();
  const [q, setQ] = useState(initial.q);

  const selectedModel = models.find((m) => m.slug === initial.model) ?? null;

  function push(next: Partial<Selection>): void {
    const merged: Selection = { ...initial, q, ...next };
    const sp = new URLSearchParams();
    if (merged.q) sp.set("q", merged.q);
    if (merged.model) sp.set("model", merged.model);
    if (merged.gen) sp.set("gen", merged.gen);
    if (merged.group) sp.set("group", merged.group);
    const qs = sp.toString();
    nav.push(qs ? `/admin/parts/refs?${qs}` : "/admin/parts/refs");
  }

  function genLabel(g: GenerationOption): string {
    return `${g.code} · ${g.yearFrom}–${g.yearTo ?? "н.в."}`;
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        push({});
      }}
    >
      <select
        value={initial.model}
        onChange={(e) => push({ model: e.target.value, gen: "" })}
        aria-label="Шаг 1: модель"
        className="input w-auto"
      >
        <option value="">Все модели</option>
        {models.map((m) => (
          <option key={m.slug} value={m.slug}>{m.name}</option>
        ))}
      </select>

      <select
        value={initial.gen}
        onChange={(e) => push({ gen: e.target.value })}
        disabled={!selectedModel}
        aria-label="Шаг 2: кузов и годы"
        className="input w-auto disabled:opacity-50"
      >
        <option value="">
          {selectedModel ? "Все кузова модели" : "Кузов — сначала модель"}
        </option>
        {selectedModel?.generations.map((g) => (
          <option key={g.code} value={g.code}>{genLabel(g)}</option>
        ))}
      </select>

      <select
        value={initial.group}
        onChange={(e) => push({ group: e.target.value })}
        aria-label="Шаг 3: агрегат"
        className="input w-auto"
      >
        <option value="">Все агрегаты · {totalInBase}</option>
        {groups.map((g) => (
          <option key={g.key} value={g.key}>{g.label} · {g.count}</option>
        ))}
      </select>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Номер или название"
        aria-label="Поиск по справочнику"
        className="input flex-1 min-w-[200px] max-w-sm"
      />
      <button type="submit" className="btn btn-secondary">Найти</button>
      {(initial.model || initial.gen || initial.group || initial.q) && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            nav.push("/admin/parts/refs");
          }}
          className="btn btn-secondary"
        >
          Сбросить
        </button>
      )}
    </form>
  );
}
