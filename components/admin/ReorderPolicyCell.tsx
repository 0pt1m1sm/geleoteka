"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setReorderPolicy } from "@/app/actions/replenishment";

/** Inline editor for a part's reorder policy (point / up-to) in the «Остатки»
 *  table. Empty input = clear the override (fall back to the host default). */
export function ReorderPolicyCell({
  partId,
  reorderPoint,
  reorderUpTo,
  disabled = false,
}: {
  partId: string;
  reorderPoint: number | null;
  reorderUpTo: number | null;
  disabled?: boolean;
}): React.ReactElement {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [point, setPoint] = useState(reorderPoint?.toString() ?? "");
  const [upTo, setUpTo] = useState(reorderUpTo?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parse(v: string): number | null {
    const t = v.trim();
    if (t === "") return null;
    // Number (not parseInt) so "2.5" stays 2.5 and the server's Number.isInteger
    // check rejects it with a readable error, rather than silently truncating to 2.
    return Number(t);
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    const result = await setReorderPolicy(partId, parse(point), parse(upTo));
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (disabled) {
    return <span className="text-[var(--foreground-muted)]">—</span>;
  }

  if (!editing) {
    const upToHint = reorderUpTo === null || (reorderPoint !== null && reorderUpTo === reorderPoint);
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex flex-col items-end gap-0.5 hover:text-[var(--color-accent)]"
        aria-label="Изменить точку дозаказа"
        title={upToHint ? "Дозаказ до точки — укажите «до» больше точки для пополнения с запасом" : undefined}
      >
        <span>
          {reorderPoint ?? "—"} / {reorderUpTo ?? "—"}
        </span>
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={point}
          onChange={(e) => setPoint(e.target.value)}
          aria-label="Точка дозаказа"
          placeholder="точка"
          className="input w-16 text-right"
        />
        <span className="text-[var(--foreground-muted)]">/</span>
        <input
          type="number"
          min={0}
          value={upTo}
          onChange={(e) => setUpTo(e.target.value)}
          aria-label="Дозаказ до"
          placeholder="до"
          className="input w-16 text-right"
        />
      </span>
      <span className="inline-flex items-center gap-2 text-xs">
        <button type="button" onClick={save} disabled={saving} className="text-[var(--color-accent)] hover:underline">
          {saving ? "…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
            setPoint(reorderPoint?.toString() ?? "");
            setUpTo(reorderUpTo?.toString() ?? "");
          }}
          className="text-[var(--foreground-muted)] hover:underline"
        >
          Отмена
        </button>
      </span>
      {error && <span className="text-xs text-[var(--color-error)]">{error}</span>}
    </span>
  );
}
