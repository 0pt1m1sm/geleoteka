"use client";

import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import type { StaffNotificationFeedScope } from "@/lib/staff-notifications/feed";

export function NotificationScopeSwitcher({
  scope,
}: {
  scope: StaffNotificationFeedScope;
}): React.ReactElement {
  const nav = useProgressRouter();

  return (
    <div className="inline-flex gap-1" role="group" aria-label="Область ленты">
      <button
        type="button"
        className={`btn text-sm ${scope === "mine" ? "btn-primary" : "btn-secondary"}`}
        aria-pressed={scope === "mine"}
        onClick={() => nav.push("/admin/notifications")}
      >
        Мои
      </button>
      <button
        type="button"
        className={`btn text-sm ${scope === "all" ? "btn-primary" : "btn-secondary"}`}
        aria-pressed={scope === "all"}
        onClick={() => nav.push("/admin/notifications?scope=all")}
      >
        Все
      </button>
    </div>
  );
}
