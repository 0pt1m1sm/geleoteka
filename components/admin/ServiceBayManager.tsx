"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  createServiceBay,
  setServiceBayActive,
  updateServiceBay,
} from "@/app/actions/service-bays";

export interface ServiceBayRow {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  slotCount: number;
}

export function ServiceBayManager({ bays }: { bays: ServiceBayRow[] }): React.ReactElement {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(bays.length * 10);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    id: string,
    operation: () => Promise<{ error: string | null }>,
  ): Promise<boolean> {
    setError(null);
    setPendingId(id);
    const result = await operation();
    setPendingId(null);
    if (result.error) {
      setError(result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function add(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (await run("create", () => createServiceBay(name, sortOrder))) {
      setName("");
      setSortOrder((current) => current + 10);
    }
  }

  async function save(id: string): Promise<void> {
    if (await run(id, () => updateServiceBay(id, editName, editSortOrder))) {
      setEditId(null);
    }
  }

  return (
    <section className="card space-y-5" aria-label="Рабочие посты">
      <div>
        <h2 className="text-lg font-semibold">Посты сервиса</h2>
        <p className="text-sm text-[var(--foreground-muted)] mt-1">
          Активных: {bays.filter((bay) => bay.isActive).length}. Это и есть число машин,
          которые можно записать одновременно. Отключённый пост остаётся в истории записей.
        </p>
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {bays.map((bay) => (
          <li key={bay.id} className="py-3">
            {editId === bay.id ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[14rem] text-sm">
                  <span className="block mb-1 text-[var(--foreground-muted)]">Название</span>
                  <input
                    className="input w-full"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={80}
                  />
                </label>
                <label className="w-28 text-sm">
                  <span className="block mb-1 text-[var(--foreground-muted)]">Порядок</span>
                  <input
                    className="input w-full"
                    type="number"
                    value={editSortOrder}
                    onChange={(event) => setEditSortOrder(Number(event.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={pendingId === bay.id}
                  onClick={() => void save(bay.id)}
                >
                  Сохранить
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                  Отмена
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{bay.name}</span>
                    {!bay.isActive ? (
                      <span className="badge text-[10px] bg-[var(--color-error-bg)] text-[var(--color-error)]">
                        отключён
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">
                    Порядок: {bay.sortOrder} · записей в истории: {bay.slotCount}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setEditId(bay.id);
                      setEditName(bay.name);
                      setEditSortOrder(bay.sortOrder);
                      setError(null);
                    }}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={pendingId === bay.id}
                    onClick={() => void run(bay.id, () => setServiceBayActive(bay.id, !bay.isActive))}
                  >
                    {bay.isActive ? "Отключить" : "Включить"}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[14rem] text-sm">
          <span className="block mb-1 text-[var(--foreground-muted)]">Новый пост</span>
          <input
            className="input w-full"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например, Пост 3"
            maxLength={80}
          />
        </label>
        <label className="w-28 text-sm">
          <span className="block mb-1 text-[var(--foreground-muted)]">Порядок</span>
          <input
            className="input w-full"
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value))}
          />
        </label>
        <button type="submit" className="btn btn-secondary" disabled={pendingId === "create"}>
          {pendingId === "create" ? "Добавляем…" : "Добавить пост"}
        </button>
      </form>

      {error ? <p className="text-sm text-[var(--color-error)]">{error}</p> : null}
    </section>
  );
}
