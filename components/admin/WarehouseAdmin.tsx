"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWarehouse, type WarehouseRow } from "@/app/actions/warehouses";

/** Admin section: list warehouses + add a new physical site (WMS Phase 6). */
export function WarehouseAdmin({ warehouses }: { warehouses: WarehouseRow[] }): React.ReactElement {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createWarehouse(code, name);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCode("");
    setName("");
    router.refresh();
  }

  return (
    <section aria-label="Склады" className="card space-y-3">
      <h2 className="text-lg font-semibold">Склады</h2>
      <ul className="divide-y divide-[var(--border)]">
        {warehouses.map((w) => (
          <li key={w.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {w.name} <span className="font-mono text-[var(--foreground-muted)]">({w.code})</span>
            </span>
            {w.isDefault && <span className="badge">по умолчанию</span>}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Код (напр. MSK)"
          aria-label="Код склада"
          className="input w-32"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название"
          aria-label="Название склада"
          className="input flex-1 min-w-[12rem]"
        />
        <button type="submit" className="btn btn-secondary" disabled={busy}>
          {busy ? "…" : "Добавить склад"}
        </button>
      </form>
      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
    </section>
  );
}
