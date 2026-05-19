import { Skeleton } from "@/components/ui";

/**
 * Estimate detail loading skeleton. Fires immediately when the row is tapped
 * so the manager sees the navigation registered — without this, the previous
 * page sits unchanged for the full SSR round-trip (~hundreds of ms on mobile).
 *
 * Layout mirrors the real page: header strip + 2-col grid (line-items card +
 * sidebar actions card on lg, single column on mobile).
 */
export default function EstimateLoading(): React.ReactElement {
  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <div className="card space-y-3" aria-hidden>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <div className="pt-3 border-t border-[var(--border)] space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-6 w-2/3 ml-auto" />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card space-y-2" aria-hidden>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
