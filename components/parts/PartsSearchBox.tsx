"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  currentQuery: string;
}

/**
 * Free-text search input. Submits to the `q` URL param. Lives at the top of
 * the catalog area (separate from the sidebar facets).
 */
export function PartsSearchBox({ currentQuery }: Props): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(currentQuery);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const next = new URLSearchParams(searchParams.toString());
    if (query.trim()) next.set("q", query.trim());
    else next.delete("q");
    router.push(`/parts?${next.toString()}`);
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
