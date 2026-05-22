"use client";

import { useState, useTransition, type FormEvent } from "react";
import { lookupLocation } from "@/app/actions/warehouse";

interface LocationItem {
  partId: string;
  name: string;
  article: string;
  quantity: number;
}

/** "What's stored in A-1-1?" — type or scan a location code to list its items. */
export function WarehouseLocationLookup(): React.ReactElement {
  const [code, setCode] = useState("");
  const [items, setItems] = useState<LocationItem[] | null>(null);
  const [searched, setSearched] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const loc = code.trim();
    if (!loc) return;
    startTransition(async () => {
      const res = await lookupLocation(loc);
      setItems(res.items);
      setSearched(loc.toUpperCase());
    });
  }

  return (
    <section aria-label="Поиск по ячейке" className="card">
      <h2 className="text-lg font-semibold mb-3">Поиск по ячейке</h2>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          aria-label="Код ячейки"
          placeholder="Отсканируйте или введите код ячейки (напр. A-1-1)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="input flex-1 font-mono"
        />
        <button type="submit" disabled={isPending} className="btn btn-secondary">
          {isPending ? "Поиск..." : "Найти"}
        </button>
      </form>

      {items !== null && (
        <div className="mt-4" aria-live="polite">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">В ячейке {searched} ничего нет</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {items.map((it) => (
                <li key={it.partId} className="flex items-center justify-between py-2">
                  <span>
                    {it.name}
                    <span className="ml-2 text-xs font-mono text-[var(--foreground-muted)]">{it.article}</span>
                  </span>
                  <span className="font-medium tabular-nums">{it.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
