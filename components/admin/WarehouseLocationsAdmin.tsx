"use client";

import { useEffect, useState, useTransition } from "react";
import { listLocationsAction, setLocationBlockedAction } from "@/app/actions/warehouse";
import type { WmsLocation } from "@/lib/wms/public";

/**
 * Admin/manager surface to review warehouse locations and block/unblock or
 * deactivate them. A blocked or inactive location rejects putaway/transfer-in
 * with LOCATION_BLOCKED. Cell configuration is not a warehouse_worker capability.
 */
export function WarehouseLocationsAdmin(): React.ReactElement {
  const [locations, setLocations] = useState<WmsLocation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    listLocationsAction()
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
  }, []);

  function toggle(code: string, flags: { isActive?: boolean; isBlocked?: boolean }): void {
    setError(null);
    startTransition(async () => {
      const res = await setLocationBlockedAction(code, flags);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.location) {
        setLocations((prev) => prev.map((l) => (l.code === res.location!.code ? res.location! : l)));
      }
    });
  }

  return (
    <section aria-label="Ячейки" className="card">
      <h2 className="text-lg font-semibold mb-3">Ячейки</h2>
      {error && <p className="alert-error mb-3">{error}</p>}
      {!loaded ? (
        <p className="text-sm text-[var(--foreground-muted)]">Загрузка…</p>
      ) : locations.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          Ячейки появятся после первого размещения товара.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {locations.map((loc) => (
            <li key={loc.code} className="flex items-center justify-between gap-4 py-2">
              <span className="font-mono">{loc.code}</span>
              <div className="flex items-center gap-2">
                {loc.isBlocked ? (
                  <span className="badge bg-[var(--color-error-bg)] text-[var(--color-error)]">Заблокирована</span>
                ) : loc.isActive ? (
                  <span className="badge">Активна</span>
                ) : (
                  <span className="badge">Неактивна</span>
                )}
                <button
                  type="button"
                  onClick={() => toggle(loc.code, { isBlocked: !loc.isBlocked })}
                  disabled={isPending}
                  className="btn btn-secondary btn-sm min-h-[44px]"
                >
                  {loc.isBlocked ? "Разблокировать" : "Заблокировать"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
