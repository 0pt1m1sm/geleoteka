"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trimLabel, type VehicleModel } from "@/lib/vehicle-catalog-types";
import { setMyCar } from "@/lib/my-car-store";

interface Props {
  /** Trim-aware catalog so the strip can resolve a trim id to its label. */
  models: VehicleModel[];
}

/**
 * Sticky strip showing the saved car. URL-driven (renders when both `model` and
 * `generation` searchParams are present) so it appears on first paint for
 * bookmark/share-link visits as well as picker-driven flows. When `trim` is
 * present the chip also includes the trim label.
 *
 * "✕" — clears localStorage AND drops URL params (model/generation/trim). The
 *       picker reappears with fresh state, ready to pick a different vehicle.
 */
export function MyCarStrip({ models }: Props): React.ReactElement | null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const model = searchParams.get("model");
  const generation = searchParams.get("generation");
  const trimId = searchParams.get("trim");

  const trimChip = useMemo(() => {
    if (!model || !generation || !trimId) return null;
    const m = models.find((mm) => mm.name === model);
    if (!m) return null;
    const g = m.generations.find((gg) => gg.code === generation);
    if (!g) return null;
    const t = (g.trims ?? []).find((tt) => tt.id === trimId);
    if (!t) return null;
    return trimLabel(t);
  }, [model, generation, trimId, models]);

  if (!model || !generation) return null;

  function urlWithoutCar(): string {
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete("model");
    newParams.delete("generation");
    newParams.delete("trim");
    newParams.delete("showAll");
    const qs = newParams.toString();
    return qs ? `/parts?${qs}` : "/parts";
  }

  function handleClear(): void {
    setMyCar(null);
    router.replace(urlWithoutCar(), { scroll: false });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="sticky top-16 z-30 mb-4 flex items-center gap-3 rounded-lg border border-accent/30 bg-card px-4 py-2 text-sm shadow-sm">
      <span className="text-foreground-muted">Ваш автомобиль:</span>
      <span className="font-medium text-accent">
        {model} · {generation}
        {trimChip && <span className="text-foreground-muted"> · {trimChip}</span>}
      </span>
      <button
        type="button"
        onClick={handleClear}
        aria-label="Сбросить выбранный автомобиль"
        className="ml-auto text-foreground-muted hover:text-[var(--color-error)] transition-colors text-base leading-none"
      >
        ✕
      </button>
    </div>
  );
}
