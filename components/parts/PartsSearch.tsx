"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  categories: { name: string; slug: string }[];
  currentQuery: string;
  currentCategory: string;
  oemOnly: boolean;
  inStockOnly: boolean;
}

export function PartsSearch({ categories, currentQuery, currentCategory, oemOnly, inStockOnly }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(currentQuery);

  function applyFilters(overrides: Record<string, string | boolean>) {
    const params = new URLSearchParams();
    const q = "q" in overrides ? (overrides.q as string) : query;
    const cat = "category" in overrides ? (overrides.category as string) : currentCategory;
    const oem = "oem" in overrides ? overrides.oem : oemOnly;
    const stock = "inStock" in overrides ? overrides.inStock : inStockOnly;

    if (q) params.set("q", q);
    if (cat) params.set("category", cat);
    if (oem) params.set("oem", "true");
    if (stock) params.set("inStock", "true");

    router.push(`/parts?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    applyFilters({});
  }

  return (
    <div className="card mb-6">
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input flex-1"
          placeholder="Поиск по названию, артикулу или модели..."
        />
        <button type="submit" className="btn btn-primary text-sm">
          Найти
        </button>
      </form>

      <div className="flex flex-wrap gap-3">
        <select
          value={currentCategory}
          onChange={(e) => applyFilters({ category: e.target.value })}
          className="input w-auto text-sm"
        >
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={oemOnly}
            onChange={(e) => applyFilters({ oem: e.target.checked })}
            className="w-4 h-4 accent-[var(--color-accent)]"
          />
          Только OEM
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => applyFilters({ inStock: e.target.checked })}
            className="w-4 h-4 accent-[var(--color-accent)]"
          />
          В наличии
        </label>
      </div>
    </div>
  );
}
