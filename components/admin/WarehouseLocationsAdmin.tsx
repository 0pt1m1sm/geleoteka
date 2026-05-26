"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Lock, Unlock, Trash2, Printer } from "lucide-react";
import {
  listLocationsAction,
  setLocationBlockedAction,
  createLocationsAction,
  renameLocationAction,
  deleteLocationAction,
} from "@/app/actions/warehouse";
import type { WmsLocation } from "@/lib/wms/public";

type Loc = WmsLocation & { onHand: number };

/**
 * Admin/manager warehouse-layout surface: create cells (single or a range like
 * A-1-1..A-3-4), rename them (moves the code + its stock), block/unblock, delete
 * empty cells, and review on-hand per cell — grouped by zone (the cell-code prefix).
 */
export function WarehouseLocationsAdmin({ warehouseId }: { warehouseId?: string }): React.ReactElement {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [createSpec, setCreateSpec] = useState("");
  const [lastCreated, setLastCreated] = useState<string[]>([]);
  const [renameCode, setRenameCode] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await listLocationsAction(warehouseId);
      setLocations(r.locations);
      setLoaded(true);
    } catch {
      setError("Не удалось загрузить ячейки");
    }
  }, [warehouseId]);

  useEffect(() => {
    let active = true;
    listLocationsAction(warehouseId)
      .then((r) => {
        if (active) {
          setLocations(r.locations);
          setLoaded(true);
        }
      })
      .catch(() => active && setError("Не удалось загрузить ячейки"));
    return () => {
      active = false;
    };
  }, [warehouseId]);

  function toggleBlock(loc: Loc): void {
    setError(null);
    startTransition(async () => {
      const res = await setLocationBlockedAction(loc.code, { isBlocked: !loc.isBlocked }, warehouseId);
      if (res.error) setError(res.error);
      else await reload();
    });
  }

  function createCells(): void {
    setError(null);
    startTransition(async () => {
      const res = await createLocationsAction(createSpec, warehouseId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setLastCreated(res.codes ?? []);
      setCreateSpec("");
      await reload();
    });
  }

  function saveRename(from: string): void {
    setError(null);
    startTransition(async () => {
      const res = await renameLocationAction(from, renameTo, warehouseId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setRenameCode(null);
      setRenameTo("");
      await reload();
    });
  }

  function deleteCell(code: string): void {
    setError(null);
    startTransition(async () => {
      const res = await deleteLocationAction(code, warehouseId);
      setConfirmDelete(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      await reload();
    });
  }

  // Group by zone = the code segment before the first "-" (A-1-1 → "A").
  const groups = new Map<string, Loc[]>();
  for (const l of [...locations].sort((a, b) => a.code.localeCompare(b.code))) {
    const zone = l.code.split("-")[0] || "—";
    (groups.get(zone) ?? groups.set(zone, []).get(zone)!).push(l);
  }

  return (
    <section aria-label="Ячейки" className="card space-y-3">
      <h2 className="text-lg font-semibold">Раскладка склада</h2>
      {error && <p className="alert-error">{error}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 min-w-[12rem]">
          <span className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">
            Создать ячейку или диапазон
          </span>
          <input
            value={createSpec}
            onChange={(e) => setCreateSpec(e.target.value)}
            placeholder="A-1-1  или  A-1-1..A-3-4"
            aria-label="Код ячейки или диапазон"
            className="input font-mono"
          />
        </label>
        <button type="button" onClick={createCells} disabled={isPending} className="btn btn-secondary btn-sm min-h-[44px]">
          Создать
        </button>
      </div>

      {lastCreated.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2">
          <span className="text-sm text-[var(--foreground-muted)]">
            Создано ячеек: <span className="font-mono text-[var(--foreground)]">{lastCreated.length}</span>. Распечатайте QR-наклейки и наклейте на полки.
          </span>
          <Link
            href={`/admin/warehouse/labels?loc=${encodeURIComponent(lastCreated.join(","))}`}
            className="btn btn-secondary btn-sm ml-auto inline-flex items-center gap-1.5"
          >
            <Printer size={16} aria-hidden />
            Печать наклеек
          </Link>
        </div>
      )}

      {!loaded ? (
        <p className="text-sm text-[var(--foreground-muted)]">Загрузка…</p>
      ) : locations.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          Ячеек пока нет — создайте их выше или они появятся после первого размещения товара.
        </p>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([zone, cells]) => (
            <div key={zone}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)] mb-1">
                Зона {zone}
              </h3>
              <ul className="divide-y divide-[var(--border)]">
                {cells.map((loc) => (
                  <li key={loc.code} className="py-1.5 text-sm">
                    {renameCode === loc.code ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[var(--foreground-muted)]">{loc.code} →</span>
                        <input
                          value={renameTo}
                          onChange={(e) => setRenameTo(e.target.value)}
                          aria-label={`Новый код для ${loc.code}`}
                          className="input w-32 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => saveRename(loc.code)}
                          disabled={isPending}
                          className="btn btn-secondary btn-sm"
                        >
                          Сохранить
                        </button>
                        <button type="button" onClick={() => setRenameCode(null)} className="btn btn-ghost btn-sm">
                          Отмена
                        </button>
                      </div>
                    ) : confirmDelete === loc.code ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[var(--foreground-muted)]">
                          Удалить <span className="font-mono text-[var(--foreground)]">{loc.code}</span>?
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteCell(loc.code)}
                          disabled={isPending}
                          className="btn btn-secondary btn-sm text-[var(--color-error)]"
                        >
                          Удалить
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="btn btn-ghost btn-sm">
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono">
                          {loc.code}
                          <span className="ml-2 text-xs text-[var(--foreground-muted)]">на складе: {loc.onHand}</span>
                          {loc.isBlocked ? (
                            <span className="badge ml-2 bg-[var(--color-error-bg)] text-[var(--color-error)]">
                              заблокирована
                            </span>
                          ) : !loc.isActive ? (
                            <span className="badge ml-2">неактивна</span>
                          ) : null}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setRenameCode(loc.code);
                              setRenameTo(loc.code);
                              setConfirmDelete(null);
                              setError(null);
                            }}
                            className="btn-icon min-h-[40px] min-w-[40px]"
                            aria-label={`Переименовать ${loc.code}`}
                            title="Переименовать"
                          >
                            <Pencil size={16} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleBlock(loc)}
                            disabled={isPending}
                            className="btn-icon min-h-[40px] min-w-[40px]"
                            aria-label={loc.isBlocked ? `Разблокировать ${loc.code}` : `Заблокировать ${loc.code}`}
                            title={loc.isBlocked ? "Разблокировать" : "Заблокировать"}
                          >
                            {loc.isBlocked ? <Unlock size={16} aria-hidden /> : <Lock size={16} aria-hidden />}
                          </button>
                          {loc.onHand === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDelete(loc.code);
                                setRenameCode(null);
                                setError(null);
                              }}
                              className="btn-icon min-h-[40px] min-w-[40px] hover:text-[var(--color-error)]"
                              aria-label={`Удалить ${loc.code}`}
                              title="Удалить"
                            >
                              <Trash2 size={16} aria-hidden />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
