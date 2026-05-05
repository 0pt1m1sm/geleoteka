"use client";

import { useMemo, useState } from "react";
import { generationLabel, trimLabel, type Trim, type VehicleModel } from "@/lib/vehicle-catalog-types";

interface Props {
  /** Form field name for the hidden input that posts the JSON-encoded trim ids. */
  name: string;
  /** Trim ids selected on initial render. */
  initial: string[];
  /** Models with trims; pass `getActiveModelsWithTrims()` from server. */
  models: VehicleModel[];
}

/**
 * Replaces the freeform "Совместимые модели" textarea on the admin part editor.
 *
 * Layout: collapsible model rows. Inside each model, every active generation
 * shows its non-default trims as checkboxes plus an "Все варианты" checkbox
 * for the generation's default trim.
 *
 * "Все варианты" is mutually exclusive with the specific trims in the same
 * generation — checking it clears the per-trim selections, and checking a
 * specific trim clears the "Все варианты" selection. Across generations the
 * sets are independent.
 */
export function PartTrimPicker({ name, initial, models }: Props): React.ReactElement {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));

  const flatGenerations = useMemo(() => {
    const flat: Array<{
      modelName: string;
      generationId: string;
      generationLabelText: string;
      defaultTrimId: string | undefined;
      trims: Trim[];
    }> = [];
    for (const m of models) {
      for (const g of m.generations) {
        flat.push({
          modelName: m.name,
          generationId: g.id,
          generationLabelText: generationLabel(g),
          defaultTrimId: g.defaultTrimId,
          trims: g.trims ?? [],
        });
      }
    }
    return flat;
  }, [models]);

  function toggleTrim(generationId: string, trimId: string, isDefault: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(trimId)) {
        next.delete(trimId);
        return next;
      }
      // Mutually exclusive within a generation: default trim vs. specific trims.
      const generation = flatGenerations.find((g) => g.generationId === generationId);
      if (generation) {
        if (isDefault) {
          for (const t of generation.trims) next.delete(t.id);
        } else if (generation.defaultTrimId) {
          next.delete(generation.defaultTrimId);
        }
      }
      next.add(trimId);
      return next;
    });
  }

  const selectedJson = JSON.stringify(Array.from(selected));
  const totalSelected = selected.size;

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selectedJson} />
      <p className="text-xs text-[var(--foreground-muted)]">
        Выбрано вариантов: <span className="font-medium text-[var(--foreground)]">{totalSelected}</span>
        {totalSelected === 0 && (
          <span className="ml-2 text-[var(--color-warning)]">
            ⚠ Запчасть не будет видна по фильтру модели
          </span>
        )}
      </p>

      <div className="space-y-2">
        {models.map((m) => {
          const modelGenerations = m.generations;
          const hasAnyInModel = modelGenerations.some(
            (g) =>
              (g.defaultTrimId && selected.has(g.defaultTrimId)) ||
              (g.trims ?? []).some((t) => selected.has(t.id)),
          );
          return (
            <details
              key={m.id}
              open={hasAnyInModel}
              className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)]/40"
            >
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:text-[var(--color-accent)]">
                {m.name}
              </summary>
              <div className="px-3 pb-3 space-y-3">
                {modelGenerations.length === 0 && (
                  <p className="text-xs text-[var(--foreground-muted)]">Нет активных поколений</p>
                )}
                {modelGenerations.map((g) => {
                  const trims = g.trims ?? [];
                  const defaultId = g.defaultTrimId;
                  const defaultChecked = defaultId !== undefined && selected.has(defaultId);
                  return (
                    <div key={g.id} className="rounded border border-[var(--border)]/60 p-2">
                      <p className="text-xs font-mono text-[var(--foreground-muted)] mb-2">
                        {generationLabel(g)}
                      </p>
                      <div className="flex flex-col gap-1">
                        {defaultId && (
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={defaultChecked}
                              onChange={() => toggleTrim(g.id, defaultId, true)}
                              className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                            />
                            <span>Все варианты этого поколения</span>
                          </label>
                        )}
                        {trims.length === 0 && defaultId && !defaultChecked && (
                          <p className="text-[11px] text-[var(--foreground-muted)] pl-5 italic">
                            Конкретные варианты ещё не заведены — пока доступен только общий.
                          </p>
                        )}
                        {trims.map((t) => (
                          <label
                            key={t.id}
                            className="flex items-center gap-2 text-xs cursor-pointer pl-4"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(t.id)}
                              onChange={() => toggleTrim(g.id, t.id, false)}
                              className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                            />
                            <span>{trimLabel(t)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
