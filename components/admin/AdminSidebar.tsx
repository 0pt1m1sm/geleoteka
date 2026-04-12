"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/shared/LogoutButton";
import { adminNav, type AdminNavGroup } from "@/lib/admin-nav";

// Manual toggle state tied to a specific pathname. When the user navigates
// away, the stored pathname no longer matches the current one and the
// override is ignored — control returns to the derived-from-pathname default.
// This pattern (resetting state via a stored key) avoids the setState-in-effect
// anti-pattern flagged by react-hooks/set-state-in-effect.
interface ManualOverride {
  pathname: string;
  openLabel: string | null; // null = explicitly closed (sentinel)
}

/** Desktop admin sidebar with single-open accordion grouping. */
export function AdminSidebar() {
  const pathname = usePathname();
  const [override, setOverride] = useState<ManualOverride | null>(null);

  const activeHref = findActiveHref(pathname);
  const activeGroupLabel = findActiveGroupLabel(activeHref);

  // Override is only honored for the pathname it was set on. After navigation,
  // the pathname differs and the derived default takes over automatically.
  const activeOverride =
    override && override.pathname === pathname ? override : null;
  const openGroup = activeOverride ? activeOverride.openLabel : activeGroupLabel;

  function toggleGroup(label: string): void {
    setOverride({
      pathname,
      openLabel: openGroup === label ? null : label,
    });
  }

  return (
    <aside className="w-64 border-r border-[var(--border)] bg-[var(--card)] hidden md:flex flex-col">
      <div className="p-6 border-b border-[var(--border)]">
        <Link href="/" className="text-display text-lg font-bold">
          <span className="text-[var(--color-accent)]">Geleoteka</span>
        </Link>
        <p className="text-xs text-[var(--color-gold)] mt-1">Админ-панель</p>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {adminNav.map((entry) => {
          if (entry.kind === "link") {
            return (
              <SidebarLink
                key={entry.href}
                href={entry.href}
                label={entry.label}
                isActive={activeHref === entry.href}
              />
            );
          }
          return (
            <SidebarGroup
              key={entry.id}
              group={entry}
              isOpen={openGroup === entry.label}
              onToggle={() => toggleGroup(entry.label)}
              activeHref={activeHref}
            />
          );
        })}
      </nav>
      <div className="p-4 border-t border-[var(--border)] space-y-1">
        <Link
          href="/"
          className="flex items-center px-3 py-2 rounded-lg text-sm text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] transition-colors"
        >
          Сайт
        </Link>
        <LogoutButton className="flex items-center px-3 py-2 rounded-lg text-sm text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] transition-colors w-full text-left" />
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  isActive,
  indent = false,
}: {
  href: string;
  label: string;
  isActive: boolean;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center ${indent ? "pl-8 pr-3" : "px-3"} py-2 rounded-lg text-sm transition-colors ${
        isActive
          ? "bg-[var(--card-hover)] text-[var(--color-accent)] font-medium"
          : "hover:bg-[var(--card-hover)]"
      }`}
    >
      {label}
    </Link>
  );
}

function SidebarGroup({
  group,
  isOpen,
  onToggle,
  activeHref,
}: {
  group: AdminNavGroup;
  isOpen: boolean;
  onToggle: () => void;
  activeHref: string | null;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={group.id}
        className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] transition-colors"
      >
        <span className="font-medium uppercase tracking-wider text-[11px]">
          {group.label}
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <div id={group.id} hidden={!isOpen} className="mt-1 space-y-1">
        {group.items.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            isActive={activeHref === item.href}
            indent
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Find the single most-specific (longest) href in adminNav whose path
 * matches the current pathname. Guarantees exactly one active link
 * even when one nav href is a prefix of another (e.g. /admin/suppliers
 * is a prefix of /admin/suppliers/orders).
 */
function findActiveHref(pathname: string): string | null {
  let bestMatch: string | null = null;
  for (const entry of adminNav) {
    const candidates =
      entry.kind === "link" ? [entry.href] : entry.items.map((i) => i.href);
    for (const href of candidates) {
      if (matchesHref(pathname, href)) {
        if (!bestMatch || href.length > bestMatch.length) {
          bestMatch = href;
        }
      }
    }
  }
  return bestMatch;
}

function findActiveGroupLabel(activeHref: string | null): string | null {
  if (!activeHref) return null;
  for (const entry of adminNav) {
    if (entry.kind !== "group") continue;
    if (entry.items.some((item) => item.href === activeHref)) {
      return entry.label;
    }
  }
  return null;
}

function matchesHref(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/admin") return false;
  return pathname.startsWith(href + "/");
}
