"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Category {
  name: string;
  slug: string;
}

interface Props {
  categories: Category[];
}

const PRESERVED_PARAMS = ["model", "generation", "showAll", "q"] as const;

type FacetKey = "category" | "oem" | "inStock" | "minPrice" | "maxPrice";

/**
 * 4-facet filter sidebar (desktop) + mobile drawer.
 * Renders inline as a sidebar for ≥lg viewports; collapses to a "Фильтры (N)"
 * button + full-screen drawer on smaller viewports. Body-scroll-lock applied
 * while the drawer is open.
 */
export function PartsFilterSidebar({ categories }: Props): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentCategory = searchParams.get("category") ?? "";
  const oemOnly = searchParams.get("oem") === "true";
  const inStockOnly = searchParams.get("inStock") === "true";
  const minPriceStr = searchParams.get("minPrice") ?? "";
  const maxPriceStr = searchParams.get("maxPrice") ?? "";

  const activeCount = useMemo(() => {
    let n = 0;
    if (currentCategory) n++;
    if (oemOnly) n++;
    if (inStockOnly) n++;
    if (minPriceStr) n++;
    if (maxPriceStr) n++;
    return n;
  }, [currentCategory, oemOnly, inStockOnly, minPriceStr, maxPriceStr]);

  // Body scroll lock while drawer is open. Restored on close + on unmount.
  useEffect(() => {
    if (!drawerOpen) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [drawerOpen]);

  function pushWith(updates: Record<string, string | null>): void {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`/parts?${next.toString()}`);
  }

  function resetAllFacets(): void {
    const next = new URLSearchParams();
    for (const k of PRESERVED_PARAMS) {
      const v = searchParams.get(k);
      if (v !== null) next.set(k, v);
    }
    router.push(`/parts?${next.toString()}`);
  }

  const FacetBody = (
    <div className="flex flex-col gap-5">
      <div>
        <label htmlFor="filter-category" className="block text-sm font-medium mb-1">
          Категория
        </label>
        <select
          id="filter-category"
          value={currentCategory}
          onChange={(e) => pushWith({ category: e.target.value || null })}
          className="input w-full text-sm"
        >
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={oemOnly}
          onChange={(e) => pushWith({ oem: e.target.checked ? "true" : null })}
          className="w-4 h-4 accent-[var(--color-accent)]"
        />
        Только OEM (оригинал)
      </label>

      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={inStockOnly}
          onChange={(e) => pushWith({ inStock: e.target.checked ? "true" : null })}
          className="w-4 h-4 accent-[var(--color-accent)]"
        />
        Только в наличии
      </label>

      <div>
        <label className="block text-sm font-medium mb-1">Цена, ₽</label>
        {/* key forces re-mount when URL-derived values change (e.g., chip ✕ clears the param)
            so the uncontrolled defaultValue stays in sync with the URL. */}
        <div key={`price-${minPriceStr}-${maxPriceStr}`} className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="от"
            defaultValue={minPriceStr}
            onBlur={(e) => pushWith({ minPrice: e.target.value || null })}
            className="input w-full text-sm"
            aria-label="Минимальная цена"
          />
          <span className="text-foreground-muted">—</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="до"
            defaultValue={maxPriceStr}
            onBlur={(e) => pushWith({ maxPrice: e.target.value || null })}
            className="input w-full text-sm"
            aria-label="Максимальная цена"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={resetAllFacets}
        className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors text-left"
      >
        Сбросить все
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="card sticky top-20">
          <h3 className="font-semibold mb-4">Фильтры</h3>
          {FacetBody}
        </div>
      </aside>

      {/* Mobile button — wrapped in a div with lg:hidden because `.btn` from globals.css
          sets display:inline-flex which beats Tailwind v4's lg:hidden specificity. */}
      <div className="lg:hidden mb-4">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="btn btn-secondary w-full"
        >
          Фильтры{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h3 className="font-semibold">Фильтры</h3>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Закрыть"
              className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors text-xl px-2"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-6">{FacetBody}</div>
          <div className="border-t border-[var(--border)] px-4 py-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="btn btn-primary w-full"
            >
              Применить
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface ChipProps {
  categories: Category[];
}

/**
 * Active-filter chip strip rendered above the grid.
 * Each chip's ✕ removes that single param from the URL.
 */
export function PartsFilterChips({ categories }: ChipProps): React.ReactElement | null {
  const router = useRouter();
  const searchParams = useSearchParams();

  const chips: { key: FacetKey; label: string }[] = [];

  const cat = searchParams.get("category");
  if (cat) {
    const found = categories.find((c) => c.slug === cat);
    chips.push({ key: "category", label: found?.name ?? cat });
  }
  if (searchParams.get("oem") === "true") chips.push({ key: "oem", label: "Только OEM" });
  if (searchParams.get("inStock") === "true") chips.push({ key: "inStock", label: "В наличии" });
  const minP = searchParams.get("minPrice");
  if (minP) chips.push({ key: "minPrice", label: `от ${minP} ₽` });
  const maxP = searchParams.get("maxPrice");
  if (maxP) chips.push({ key: "maxPrice", label: `до ${maxP} ₽` });

  if (chips.length === 0) return null;

  function removeChip(key: FacetKey): void {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(key);
    router.push(`/parts?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => removeChip(c.key)}
          className="badge text-xs flex items-center gap-1 px-3 py-1 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
        >
          {c.label}
          <span aria-hidden>✕</span>
        </button>
      ))}
    </div>
  );
}
