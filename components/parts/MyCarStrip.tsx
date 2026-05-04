"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { setMyCar } from "@/lib/my-car-store";

/**
 * Sticky strip showing the saved car. URL-driven (renders when both `model` and
 * `generation` searchParams are present) so it appears on first paint for
 * bookmark/share-link visits as well as picker-driven flows.
 *
 * "Сменить" and "✕" both clear the car: drop URL params + clear localStorage.
 */
export function MyCarStrip(): React.ReactElement | null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const model = searchParams.get("model");
  const generation = searchParams.get("generation");

  if (!model || !generation) return null;

  function clearAndReset(): void {
    setMyCar(null);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete("model");
    newParams.delete("generation");
    newParams.delete("showAll");
    const qs = newParams.toString();
    router.push(qs ? `/parts?${qs}` : "/parts");
  }

  return (
    <div className="sticky top-16 z-30 mb-4 flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-accent)]/30 bg-[var(--card)] px-4 py-2 text-sm shadow-sm">
      <span className="text-[var(--foreground-muted)]">Ваш автомобиль:</span>
      <span className="font-medium text-[var(--color-accent)]">
        {model} · {generation}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={clearAndReset}
          className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          Сменить
        </button>
        <button
          type="button"
          onClick={clearAndReset}
          aria-label="Очистить"
          className="text-[var(--foreground-muted)] hover:text-[var(--color-error)] transition-colors"
        >
          ✕
        </button>
      </span>
    </div>
  );
}
