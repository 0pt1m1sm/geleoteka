"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";

interface Props {
  currentQuery: string;
}

/**
 * Free-text search input. Submits to the `q` URL param. Lives at the top of
 * the catalog area (separate from the sidebar facets).
 */
export function PartsSearchBox({ currentQuery }: Props): React.ReactElement {
  const nav = useProgressRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(currentQuery);

  // Re-sync when `q` changes externally (back/forward nav, a "clear filters" link).
  useEffect(() => {
    setQuery(currentQuery);
  }, [currentQuery]);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const next = new URLSearchParams(searchParams.toString());
    if (query.trim()) next.set("q", query.trim());
    else next.delete("q");
    nav.push(`/parts?${next.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="input flex-1"
        placeholder="Поиск по названию или артикулу..."
        aria-label="Поиск запчастей"
      />
      <button type="submit" className="btn btn-primary text-sm">
        Найти
      </button>
    </form>
  );
}
