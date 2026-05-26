"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createWarehouse,
  editWarehouse,
  setDefaultWarehouse,
  setWarehouseActive,
  type WarehouseRow,
} from "@/app/actions/warehouses";

/** Admin section: list, add, edit, set-default, and (de)activate warehouses (WMS Phase 6). */
export function WarehouseAdmin({ warehouses }: { warehouses: WarehouseRow[] }): React.ReactElement {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null); // row id, or "create"
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");

  async function run(fn: () => Promise<{ error: string | null }>, id: string): Promise<boolean> {
    setError(null);
    setPendingId(id);
    const res = await fn();
    setPendingId(null);
    if (res.error) {
      setError(res.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function add(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const ok = await run(() => createWarehouse(code, name), "create");
    if (ok) {
      setCode("");
      setName("");
    }
  }

  async function saveEdit(id: string): Promise<void> {
    const ok = await run(() => editWarehouse(id, editCode, editName), id);
    if (ok) setEditId(null);
  }

  return (
    <section aria-label="Склады" className="card space-y-3">
      <h2 className="text-lg font-semibold">Склады</h2>
      <ul className="divide-y divide-[var(--border)]">
        {warehouses.map((w) => (
          <li key={w.id} className="py-2 text-sm">
            {editId === w.id ? (
              <div className="flex flex-wrap items-end gap-2">
                <input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  aria-label="Код склада"
                  className="input w-28 font-mono"
                />
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label="Название склада"
                  className="input flex-1 min-w-[10rem]"
                />
                <button
                  type="button"
                  onClick={() => saveEdit(w.id)}
                  disabled={pendingId === w.id}
                  className="btn btn-secondary btn-sm"
                >
                  Сохранить
                </button>
                <button type="button" onClick={() => setEditId(null)} className="btn btn-ghost btn-sm">
                  Отмена
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {w.name} <span className="font-mono text-[var(--foreground-muted)]">({w.code})</span>
                  {w.isDefault && <span className="badge ml-2">по умолчанию</span>}
                  {!w.isActive && (
                    <span className="badge ml-2 bg-[var(--color-error-bg)] text-[var(--color-error)]">неактивен</span>
                  )}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(w.id);
                      setEditCode(w.code);
                      setEditName(w.name);
                      setError(null);
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    Изменить
                  </button>
                  {!w.isDefault && w.isActive && (
                    <button
                      type="button"
                      onClick={() => run(() => setDefaultWarehouse(w.id), w.id)}
                      disabled={pendingId === w.id}
                      className="btn btn-secondary btn-sm"
                    >
                      Сделать основным
                    </button>
                  )}
                  {!w.isDefault && (
                    <button
                      type="button"
                      onClick={() => run(() => setWarehouseActive(w.id, !w.isActive), w.id)}
                      disabled={pendingId === w.id}
                      className="btn btn-ghost btn-sm"
                    >
                      {w.isActive ? "Деактивировать" : "Активировать"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Код (напр. MSK)"
          aria-label="Код нового склада"
          className="input w-32"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название"
          aria-label="Название нового склада"
          className="input flex-1 min-w-[12rem]"
        />
        <button type="submit" className="btn btn-secondary" disabled={pendingId === "create"}>
          {pendingId === "create" ? "…" : "Добавить склад"}
        </button>
      </form>
      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
    </section>
  );
}
