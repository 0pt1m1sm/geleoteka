"use client";

import { useQuery } from "@tanstack/react-query";

async function fetchUnreadCount(): Promise<number> {
  try {
    const response = await fetch("/api/admin/notifications/count", { cache: "no-store" });
    if (!response.ok) return 0;
    const payload = (await response.json()) as { unread?: number };
    return typeof payload.unread === "number" ? payload.unread : 0;
  } catch {
    return 0;
  }
}

export function NotificationsBadge(): React.ReactElement | null {
  const { data } = useQuery({
    queryKey: ["admin-staff-notifications-unread"],
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (!data || data <= 0) return null;
  return (
    <span
      className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded bg-[var(--color-accent)] px-1.5 text-[11px] font-medium text-[var(--color-accent-foreground)]"
      aria-label={`Непрочитанных уведомлений: ${data}`}
    >
      {data > 99 ? "99+" : data}
    </span>
  );
}
