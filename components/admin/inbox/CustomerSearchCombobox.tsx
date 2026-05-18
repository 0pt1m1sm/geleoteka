"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui";

interface CustomerOption {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface Props {
  onSelect(option: CustomerOption): void;
  placeholder?: string;
}

/**
 * Typeahead combobox for picking a customer by name/email/phone. Hits the
 * `/api/admin/customers/search?q=` route. Results update as the user types
 * (debounce handled by AbortController on each keystroke).
 */
export function CustomerSearchCombobox({
  onSelect,
  placeholder = "Имя, email или телефон",
}: Props): React.ReactElement {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);

  const trimmed = q.trim();
  const hasQuery = trimmed.length >= 2;

  useEffect(() => {
    if (!hasQuery) return;
    const controller = new AbortController();
    fetch(`/api/admin/customers/search?q=${encodeURIComponent(trimmed)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          setResults(Array.isArray(data?.results) ? data.results : []);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [hasQuery, trimmed]);

  return (
    <div className="space-y-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        autoFocus
      />
      {hasQuery && results.length > 0 ? (
        <ul className="max-h-64 overflow-y-auto border border-[var(--border)] rounded">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-[var(--background-elevated)] focus:bg-[var(--background-elevated)]"
                onClick={() => onSelect(r)}
              >
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-[var(--foreground-muted)]">
                  {r.email} · {r.phone}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : hasQuery ? (
        <p className="text-xs text-[var(--foreground-muted)]">Никого не найдено</p>
      ) : null}
    </div>
  );
}
