import { Skeleton } from "@/components/ui";
import { TopProgressBar } from "@/components/shared/TopProgressBar";

const ROWS = Array.from({ length: 6 });

/**
 * Generic admin loading state. Renders for /admin and any nested admin route
 * that doesn't supply its own loading.tsx. Layout: PageHeader skeleton + a
 * stacked card list — close-enough fit for both the dashboard and the
 * standard admin list pages (orders, parts, customers, etc.).
 */
export default function AdminLoading(): React.ReactElement {
  return (
    <>
      <TopProgressBar />
      <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <Skeleton className="h-3 w-12 mb-2" />
          <Skeleton className="h-9 w-56" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="space-y-3">
        {ROWS.map((_, i) => (
          <div key={i} className="card" aria-hidden>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
      </div>
    </>
  );
}
