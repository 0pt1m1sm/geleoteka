"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Print controls + bin-label generator for /admin/warehouse/labels. The print
 * button calls window.print() (the admin chrome is already `print:hidden`); the
 * generator appends typed/scanned locations to the `?loc=` param so their labels
 * render. Hidden when printing.
 */
export function LabelSheetControls(): React.ReactElement {
  const router = useRouter();
  const params = useSearchParams();
  const [locInput, setLocInput] = useState("");

  function addLocations(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const added = locInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (added.length === 0) return;
    const existing = (params.get("loc") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...existing, ...added]));
    const next = new URLSearchParams(params.toString());
    next.set("loc", merged.join(","));
    router.push(`/admin/warehouse/labels?${next.toString()}`);
    setLocInput("");
  }

  return (
    <div className="print:hidden mb-4 flex flex-wrap items-end gap-3">
      <button type="button" onClick={() => window.print()} className="btn btn-primary">
        Печать
      </button>
      <form onSubmit={addLocations} className="flex gap-2">
        <input
          value={locInput}
          onChange={(e) => setLocInput(e.target.value)}
          placeholder="Ячейки: A-1-1, B-2"
          aria-label="Ячейки для этикеток"
          className="input w-64 max-w-full font-mono"
        />
        <button type="submit" className="btn btn-secondary">
          Добавить ячейки
        </button>
      </form>
    </div>
  );
}
