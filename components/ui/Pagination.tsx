import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
  /** 1-based current page. */
  currentPage: number;
  /** Total number of pages (≥1). */
  totalPages: number;
  /** Function that returns the URL for a given 1-based page number. */
  buildHref: (page: number) => string;
  /** Optional accessible name for the navigation landmark. */
  ariaLabel?: string;
  /** Visible neighbour count on each side of current (default 1). */
  siblingCount?: number;
}

const ELLIPSIS = "…" as const;

function getPageItems(current: number, total: number, sibling: number): Array<number | typeof ELLIPSIS> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const first = 1;
  const last = total;
  const left = Math.max(current - sibling, first + 1);
  const right = Math.min(current + sibling, last - 1);
  const items: Array<number | typeof ELLIPSIS> = [first];
  if (left > first + 1) items.push(ELLIPSIS);
  for (let p = left; p <= right; p++) items.push(p);
  if (right < last - 1) items.push(ELLIPSIS);
  items.push(last);
  return items;
}

/**
 * Pagination — accessible page navigator. URL-driven; renders one <Link> per
 * page so each page is a real navigable state. Use with server-component lists.
 */
export function Pagination({
  currentPage,
  totalPages,
  buildHref,
  ariaLabel = "Пагинация",
  siblingCount = 1,
}: PaginationProps): React.ReactElement | null {
  if (totalPages <= 1) return null;
  const items = getPageItems(currentPage, totalPages, siblingCount);
  const prevPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);
  const atFirst = currentPage <= 1;
  const atLast = currentPage >= totalPages;
  const baseLink = "btn-icon h-9 min-w-9 px-2";

  return (
    <nav aria-label={ariaLabel} className="flex items-center justify-center gap-1 mt-8">
      {atFirst ? (
        <span className={`${baseLink} opacity-40 cursor-not-allowed`} aria-hidden>
          <ChevronLeft size={16} />
        </span>
      ) : (
        <Link href={buildHref(prevPage)} className={baseLink} aria-label="Предыдущая страница" rel="prev">
          <ChevronLeft size={16} aria-hidden />
        </Link>
      )}

      {items.map((item, idx) => {
        if (item === ELLIPSIS) {
          return (
            <span key={`ellipsis-${idx}`} className="px-2 text-[var(--foreground-muted)] select-none" aria-hidden>
              {ELLIPSIS}
            </span>
          );
        }
        const isCurrent = item === currentPage;
        return (
          <Link
            key={item}
            href={buildHref(item)}
            aria-label={`Страница ${item}`}
            aria-current={isCurrent ? "page" : undefined}
            className={`${baseLink} text-sm font-medium ${
              isCurrent
                ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:bg-[var(--color-accent)]"
                : ""
            }`}
          >
            {item}
          </Link>
        );
      })}

      {atLast ? (
        <span className={`${baseLink} opacity-40 cursor-not-allowed`} aria-hidden>
          <ChevronRight size={16} />
        </span>
      ) : (
        <Link href={buildHref(nextPage)} className={baseLink} aria-label="Следующая страница" rel="next">
          <ChevronRight size={16} aria-hidden />
        </Link>
      )}
    </nav>
  );
}
