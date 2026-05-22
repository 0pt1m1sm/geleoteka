"use client";

import { useState } from "react";

export interface CustomerTab {
  key: string;
  label: string;
  content: React.ReactNode;
}

/**
 * Client tab switcher for the Customer 360 page. Panels are server-rendered and
 * passed in as `content`; all stay mounted (toggled via `hidden`) so embedded
 * client components (CommunicationLogger, CrmTaskList) keep their state and
 * don't re-fetch on tab switch.
 */
export function CustomerTabs({ tabs }: { tabs: CustomerTab[] }): React.ReactElement {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-[var(--border)] mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active === t.key
                ? "border-[var(--color-accent)] text-[var(--foreground)] font-medium"
                : "border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
