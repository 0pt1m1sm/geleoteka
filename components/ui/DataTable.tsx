"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface DataTableColumn<T> {
  /** Stable key for the column — identifies which value to extract from row. */
  key: keyof T | string;
  /** Visible header cell text. */
  header: ReactNode;
  /** Custom render. If absent, renders `String(row[key])`. */
  render?: (row: T) => ReactNode;
  /** Tailwind / data-attribute width hint applied to <th> and <td> via inline style. */
  width?: string;
  /** Allow click-to-sort. Sort uses native comparator on the value at `key`. */
  sortable?: boolean;
  /** Tailwind classes for cell alignment ("text-right" for numbers). */
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Stable React key per row. */
  getRowKey: (row: T) => string;
  /** Optional row-click handler — wraps each row in a button-like element. */
  onRowClick?: (row: T) => void;
  /** Initial sort key — must match a sortable column. */
  defaultSortKey?: keyof T | string;
  defaultSortDir?: "asc" | "desc";
  /** Tailwind class applied to the wrapping <table>. */
  tableClassName?: string;
  /** Visible label for screen readers. */
  ariaLabel?: string;
  /** Empty-state content when data is empty. */
  emptyState?: ReactNode;
}

/**
 * DataTable — sticky-header sortable table for admin lists. Sort runs entirely
 * client-side on already-fetched data (out of scope to call server actions).
 * For mobile (`<lg`), the page should render <DataList> as an alternate view.
 */
export function DataTable<T>({
  columns,
  data,
  getRowKey,
  onRowClick,
  defaultSortKey,
  defaultSortDir = "asc",
  tableClassName = "",
  ariaLabel,
  emptyState,
}: DataTableProps<T>): React.ReactElement {
  const [sortKey, setSortKey] = useState<keyof T | string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey as string];
      const bv = (b as Record<string, unknown>)[sortKey as string];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return sortDir === "asc" ? as.localeCompare(bs, "ru") : bs.localeCompare(as, "ru");
    });
    return copy;
  }, [data, sortKey, sortDir]);

  function toggleSort(col: DataTableColumn<T>): void {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  }

  if (data.length === 0 && emptyState) {
    return <div>{emptyState}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-xl)] border border-[var(--border)]">
      <table
        className={`w-full text-sm border-collapse ${tableClassName}`.trim()}
        aria-label={ariaLabel}
      >
        <thead className="sticky top-0 bg-[var(--card)] z-10">
          <tr className="border-b border-[var(--border)]">
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              const SortIcon = sortDir === "asc" ? ChevronUp : ChevronDown;
              return (
                <th
                  key={String(col.key)}
                  scope="col"
                  className={`px-4 py-3 text-left font-medium text-[var(--foreground-muted)] uppercase tracking-wider text-[11px] ${col.className ?? ""}`.trim()}
                  style={col.width ? { width: col.width } : undefined}
                  aria-sort={isSorted ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)] rounded"
                    >
                      {col.header}
                      {isSorted ? <SortIcon size={12} aria-hidden /> : null}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-[var(--border)] last:border-0 ${
                onRowClick ? "cursor-pointer hover:bg-[var(--card-hover)]" : ""
              } transition-colors`}
            >
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className={`px-4 py-3 ${col.className ?? ""}`.trim()}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key as string] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
