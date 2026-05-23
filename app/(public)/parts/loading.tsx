import { Skeleton } from "@/components/ui";
import { TopProgressBar } from "@/components/shared/TopProgressBar";

const SKELETON_CARDS = Array.from({ length: 9 });

export default function PartsLoading(): React.ReactElement {
  return (
    <>
      <TopProgressBar />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center mb-8">
        <Skeleton className="mx-auto h-10 w-48 mb-3" />
        <Skeleton className="mx-auto h-4 w-80" />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-64 shrink-0 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </aside>

        <main className="flex-1 min-w-0">
          <Skeleton className="h-11 w-full mb-4" />
          <Skeleton className="h-5 w-32 mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SKELETON_CARDS.map((_, i) => (
              <div
                key={i}
                className="card flex flex-col"
                aria-hidden
              >
                <Skeleton className="aspect-square w-full mb-3" />
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-3 w-24 mb-2" />
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--border)]">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
      </div>
    </>
  );
}
