import type { ReactNode } from "react";
import { Card } from "./Card";

export interface DataListProps<T> {
  data: T[];
  getRowKey: (row: T) => string;
  /** Render a single row as a Card body. */
  renderRow: (row: T) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
  /** Visible label for screen readers. */
  ariaLabel?: string;
}

/**
 * DataList — mobile-friendly alternative to DataTable. Each row renders as a
 * <Card>. Pages typically render DataTable on lg+ and DataList below via CSS
 * (`hidden lg:block` / `lg:hidden`).
 */
export function DataList<T>({
  data,
  getRowKey,
  renderRow,
  emptyState,
  className = "",
  ariaLabel,
}: DataListProps<T>): React.ReactElement {
  if (data.length === 0 && emptyState) {
    return <div>{emptyState}</div>;
  }
  return (
    <ul className={`space-y-3 ${className}`.trim()} aria-label={ariaLabel}>
      {data.map((row) => (
        <li key={getRowKey(row)}>
          <Card>{renderRow(row)}</Card>
        </li>
      ))}
    </ul>
  );
}
