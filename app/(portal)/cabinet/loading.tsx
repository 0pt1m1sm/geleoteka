import { Skeleton } from "@/components/ui";

export default function CabinetLoading(): React.ReactElement {
  return (
    <div>
      <div className="mb-8">
        <Skeleton className="h-3 w-12 mb-2" />
        <Skeleton className="h-9 w-56" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card" aria-hidden>
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>

      <Skeleton className="h-5 w-40 mb-4" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card" aria-hidden>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
