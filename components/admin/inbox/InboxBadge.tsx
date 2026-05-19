"use client";

import { useQuery } from "@tanstack/react-query";

interface CountResponse {
  pending?: number;
}

async function fetchPending(): Promise<number> {
  try {
    const res = await fetch("/api/admin/inbox/count", { cache: "no-store" });
    if (!res.ok) return 0;
    const data = (await res.json()) as CountResponse;
    return typeof data?.pending === "number" ? data.pending : 0;
  } catch {
    return 0;
  }
}

/**
 * Pending-count badge for the admin sidebar "Входящие" link. Polls every
 * 60 s; renders nothing when the count is 0 to keep the sidebar quiet.
 *
 * No initialData — React Query would treat 0 as cached-fresh for staleTime
 * and skip the on-mount fetch, leaving the badge empty for ~55s after a
 * hard refresh. Letting `data` be undefined on first render means the badge
 * is hidden until the first fetch returns (typically < 200ms), which is the
 * desired UX: no flash of zero, no 55s delay.
 */
export function InboxBadge(): React.ReactElement | null {
  const { data } = useQuery({
    queryKey: ["admin-inbox-pending-count"],
    queryFn: fetchPending,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (!data || data <= 0) return null;
  return (
    <span
      className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium rounded bg-[var(--color-accent)] text-[var(--background)]"
      aria-label={`Непрочитанных писем: ${data}`}
    >
      {data > 99 ? "99+" : data}
    </span>
  );
}
