"use client";

import { useEffect, useState } from "react";

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
 *
 * На узком экране — список, а не прокручиваемая полоса. Полоса уезжала за край:
 * «Обзор» оказывался обрезан слева, а «Задачи» — за правым краем, и о них
 * попросту не догадывались. Список всегда показывает, где ты сейчас, и содержит
 * все разделы разом. То же решение и в почтовом ящике — см. `InboxTabs`.
 */
export function CustomerTabs({
  tabs,
  initialTab,
}: {
  tabs: CustomerTab[];
  initialTab?: string;
}): React.ReactElement {
  const [active, setActive] = useState(() =>
    initialTab && tabs.some((tab) => tab.key === initialTab)
      ? initialTab
      : tabs[0]?.key ?? "",
  );

  useEffect(() => {
    const anchor = decodeURIComponent(window.location.hash.slice(1));
    if (!anchor.startsWith("communication-")) return;
    if (!tabs.some((tab) => tab.key === "communications")) return;
    requestAnimationFrame(() => {
      setActive("communications");
      requestAnimationFrame(() => {
        document.getElementById(anchor)?.scrollIntoView({ block: "center" });
      });
    });
  }, [tabs]);

  return (
    <div>
      <div className="sm:hidden mb-6">
        <select
          className="input"
          value={active}
          onChange={(e) => setActive(e.target.value)}
          aria-label="Раздел"
        >
          {tabs.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div role="tablist" className="hidden sm:flex gap-1 border-b border-[var(--border)] mb-6">
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
