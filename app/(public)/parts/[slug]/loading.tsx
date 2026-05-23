import { Skeleton } from "@/components/ui";
import { TopProgressBar } from "@/components/shared/TopProgressBar";

export default function PartDetailLoading(): React.ReactElement {
  return (
    <>
      <TopProgressBar />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-32 mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <Skeleton className="aspect-square w-full mb-3" />
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="w-16 h-16" />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-9 w-full mb-2" />
            <Skeleton className="h-5 w-32" />
          </div>

          <div className="card space-y-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>

          <div className="card space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
