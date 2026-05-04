"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { setMyCar } from "@/lib/my-car-store";

/**
 * Sticky strip showing the saved car. URL-driven (renders when both `model` and
 * `generation` searchParams are present) so it appears on first paint for
 * bookmark/share-link visits as well as picker-driven flows.
 *
 * "✕" — clears localStorage AND drops URL params. The picker reappears with
 *       fresh state, ready to pick a different vehicle. Single action — the
 *       previous "Сменить" button (which kept localStorage) was removed
 *       because it consistently failed to surface the picker on mobile.
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
