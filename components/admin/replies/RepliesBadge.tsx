"use client";

import { useQuery } from "@tanstack/react-query";

interface CountResponse {
  count?: number;
}

async function fetchOpenFollowUps(): Promise<number> {
  try {
    const res = await fetch("/api/admin/replies/count", { cache: "no-store" });
    if (!res.ok) return 0;
    const data = (await res.json()) as CountResponse;
    return typeof data?.count === "number" ? data.count : 0;
  } catch {
    return 0;
  }
}

/**
 * Open FOLLOW_UP-task badge for the admin sidebar "Задачи" link. Polls every
 * 60 s; renders nothing when the count is 0 to keep the sidebar quiet.
 *
 * Per-user: each admin/manager sees only their own count — derived from
 * CrmTask.ownerUserId == session.userId on the server. Tasks are auto-created
 * by `ensureFollowUpTask` when known customers reply via email, owned by the
 * deal's owner (or first ADMIN fallback when no deal owner).
 */
export function RepliesBadge(): React.ReactElement | null {
  const { data } = useQuery({
    queryKey: ["admin-followup-tasks-count"],
    queryFn: fetchOpenFollowUps,
    refetchInterval: 60_000,
    staleTime: 55_000,
    initialData: 0,
  });
  if (!data || data <= 0) return null;
  return (
    <span
      className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium rounded bg-[var(--color-accent)] text-[var(--background)]"
      aria-label={`Открытых задач-ответов: ${data}`}
    >
      {data > 99 ? "99+" : data}
    </span>
  );
}
