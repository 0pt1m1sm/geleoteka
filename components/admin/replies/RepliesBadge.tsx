"use client";

import { useQuery } from "@tanstack/react-query";

interface CountResponse {
  count?: number;
}

async function fetchOpenTaskCount(): Promise<number> {
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
 * Open-task badge for the admin sidebar "Задачи" link. Polls every 60 s;
 * renders nothing when the count is 0 to keep the sidebar quiet.
 *
 * Per-user: each admin/manager sees only their own count — derived from
 * CrmTask.ownerUserId == session.userId on the server. Includes every
 * open task kind (FOLLOW_UP auto-created from inbound email,
 * manager-created GENERIC / CALLBACK / PAYMENT_REMINDER, etc.) so the
 * badge equals what the user sees under "Мои · Все открытые" on
 * /admin/crm/tasks. Persists until each task is completed or cancelled —
 * visiting the tasks page does NOT clear it.
 */
export function RepliesBadge(): React.ReactElement | null {
  // No initialData — React Query treats 0 as cached-fresh for staleTime and
  // skips the on-mount fetch, leaving the badge empty for ~55s after a
  // hard refresh. Letting `data` be undefined on first render keeps the
  // badge hidden until the first fetch resolves (<200ms typical), then it
  // appears. Polling continues every 60s afterwards.
  const { data } = useQuery({
    queryKey: ["admin-open-tasks-count"],
    queryFn: fetchOpenTaskCount,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (!data || data <= 0) return null;
  return (
    <span
      className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium rounded bg-[var(--color-accent)] text-[var(--background)]"
      aria-label={`Открытых задач: ${data}`}
    >
      {data > 99 ? "99+" : data}
    </span>
  );
}
