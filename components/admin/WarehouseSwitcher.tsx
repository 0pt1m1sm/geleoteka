"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import type { WarehouseRow } from "@/app/actions/warehouses";

/** Active-warehouse selector: drives the `?wh=<id>` query param so the server
 *  page re-renders scoped to the chosen warehouse. Hidden when only one exists. */
export function WarehouseSwitcher({
  warehouses,
  current,
}: {
  warehouses: WarehouseRow[];
  current: string;
}): React.ReactElement | null {
  const nav = useProgressRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (warehouses.length <= 1) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const next = new URLSearchParams(params.toString());
    next.set("wh", e.target.value);
    nav.push(`${pathname}?${next.toString()}`);
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-[var(--foreground-muted)]">Склад:</span>
      <select value={current} onChange={onChange} aria-label="Активный склад" className="input w-auto">
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} ({w.code})
            {w.isDefault ? " ★" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
