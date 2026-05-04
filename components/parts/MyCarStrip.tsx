"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { setMyCar } from "@/lib/my-car-store";

/**
 * Sticky strip showing the saved car. URL-driven (renders when both `model` and
 * `generation` searchParams are present) so it appears on first paint for
 * bookmark/share-link visits as well as picker-driven flows.
 *
 * "Сменить" — drops URL params only, keeps localStorage. The picker reappears;
 *             user can pick a new car (which overwrites localStorage) or
 *             navigate away and have their saved car still restored next time.
 * "✕"       — clears localStorage AND drops URL params. Full reset.
 */
export function MyCarStrip(): React.ReactElement | null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const model = searchParams.get("model");
  const generation = searchParams.get("generation");

  if (!model || !generation) return null;

  function urlWithoutCar(): string {
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete("model");
    newParams.delete("generation");
    newParams.delete("showAll");
    const qs = newParams.toString();
    return qs ? `/parts?${qs}` : "/parts";
  }

  function handleChange(): void {
    // Keep localStorage; just drop URL params so picker re-appears.
    router.push(urlWithoutCar());
  }

  function handleClear(): void {
    setMyCar(null);
    router.push(urlWithoutCar());
  }

  return (
    <div className="sticky top-16 z-30 mb-4 flex items-center gap-3 rounded-lg border border-accent/30 bg-card px-4 py-2 text-sm shadow-sm">
      <span className="text-foreground-muted">Ваш автомобиль:</span>
      <span className="font-medium text-accent">
        {model} · {generation}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={handleChange}
          className="text-xs text-foreground-muted hover:text-foreground transition-colors"
        >
          Сменить
        </button>
        <button
          type="button"
          onClick={handleClear}
          aria-label="Очистить выбранный автомобиль"
          className="text-foreground-muted hover:text-[var(--color-error)] transition-colors"
        >
          ✕
        </button>
      </span>
    </div>
  );
}
