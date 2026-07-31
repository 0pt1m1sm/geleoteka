"use client";

import { useQuery } from "@tanstack/react-query";

interface CountResponse {
  count?: number;
  teamReplyCount?: number;
}

interface OpenTaskCounts {
  personal: number;
  teamReplies: number;
}

async function fetchOpenTaskCounts(): Promise<OpenTaskCounts> {
  try {
    const res = await fetch("/api/admin/replies/count", { cache: "no-store" });
    if (!res.ok) return { personal: 0, teamReplies: 0 };
    const data = (await res.json()) as CountResponse;
    return {
      personal: typeof data?.count === "number" ? data.count : 0,
      teamReplies: typeof data?.teamReplyCount === "number" ? data.teamReplyCount : 0,
    };
  } catch {
    return { personal: 0, teamReplies: 0 };
  }
}

/**
 * Open-task badges for the admin sidebar "Задачи" link. Polls every 60 s;
 * renders nothing when both counts are 0 to keep the sidebar quiet.
 *
 * "Мои" remains per-user — derived from CrmTask.ownerUserId == session.userId
 * on the server. It includes every
 * open task kind (FOLLOW_UP auto-created from inbound email,
 * manager-created GENERIC / CALLBACK / PAYMENT_REMINDER, etc.) so the
 * badge equals what the user sees under "Мои · Все открытые" on
 * /admin/crm/tasks. Persists until each task is completed or cancelled —
 * visiting the tasks page does NOT clear it. "Команда" counts all OPEN
 * FOLLOW_UP tasks, including other owners and the unassigned shared queue.
 */
export function RepliesBadge(): React.ReactElement | null {
  // No initialData — React Query treats 0 as cached-fresh for staleTime and
  // skips the on-mount fetch, leaving the badge empty for ~55s after a
  // hard refresh. Letting `data` be undefined on first render keeps the
  // badge hidden until the first fetch resolves (<200ms typical), then it
  // appears. Polling continues every 60s afterwards.
  const { data } = useQuery({
    queryKey: ["admin-open-tasks-count"],
    queryFn: fetchOpenTaskCounts,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (!data || (data.personal <= 0 && data.teamReplies <= 0)) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1" aria-label="Открытые задачи">
      {data.personal > 0 ? (
        <span
          className="inline-flex items-center justify-center h-5 px-1.5 text-[10px] font-medium rounded bg-[var(--color-accent)] text-[var(--background)]"
          aria-label={`Мои открытые задачи: ${data.personal}`}
          title="Мои открытые задачи"
        >
          Мои {formatCount(data.personal)}
        </span>
      ) : null}
      {data.teamReplies > 0 ? (
        <span
          className="inline-flex items-center justify-center h-5 px-1.5 text-[10px] font-medium rounded border border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--background-secondary)]"
          aria-label={`Ответы клиентов команды: ${data.teamReplies}`}
          title="Ответы клиентов всей команды, включая неназначенные"
        >
          Команда {formatCount(data.teamReplies)}
        </span>
      ) : null}
    </span>
  );
}

function formatCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}
