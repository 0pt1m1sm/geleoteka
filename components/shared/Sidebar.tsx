"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { LogoutButton } from "@/components/shared/LogoutButton";
import {
  type AdminNavEntry,
  type AdminNavGroup,
  findActiveGroupLabel,
  findActiveHref,
  matchesHref,
} from "@/lib/admin-nav";
import { useAccordionGroup } from "@/lib/use-accordion-group";

export interface SidebarProps {
  /** Navigation tree — supports flat links and grouped accordions. */
  nav: readonly AdminNavEntry[];
  brandLabel: string;
  /** When true, renders a "На сайт" link in the footer. Default true for portal/admin. */
  showSiteLink?: boolean;
  /** When true, renders the LogoutButton in the footer. Default true. */
  showLogout?: boolean;
  /** Callback fired when any nav link is clicked — used by mobile drawer to close. */
  onNavigate?: () => void;
  className?: string;
}

/**
 * Unified sidebar for portal & admin layers.
 * Single source of truth for navigation chrome — replaces AdminSidebar +
 * inline portal sidebar from app/(portal)/layout.tsx.
 */
export function Sidebar({
  nav,
  brandLabel,
  showSiteLink = true,
  showLogout = true,
  onNavigate,
  className = "",
}: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const activeHref = findActiveHref(pathname, nav);
  const activeGroupLabel = findActiveGroupLabel(activeHref, nav);
  const [openGroup, toggleGroup] = useAccordionGroup(activeGroupLabel);

  return (
    <div className={`flex flex-col h-full ${className}`.trim()}>
      <div className="p-6 border-b border-[var(--border)]">
        <Link
          href="/"
          onClick={onNavigate}
          className="text-display text-xl font-bold text-[var(--color-accent)]"
        >
          Geleoteka
        </Link>
        <p className="text-xs text-[var(--foreground-muted)] mt-1">{brandLabel}</p>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {nav.map((entry) => {
          if (entry.kind === "link") {
            return (
              <SidebarLink
                key={entry.href}
                href={entry.href}
                label={entry.label}
                isActive={activeHref === entry.href}
                onNavigate={onNavigate}
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
              pathname={pathname}
              onNavigate={onNavigate}
            />
          );
        })}
      </nav>
      {(showSiteLink || showLogout) && (
        <div className="p-4 border-t border-[var(--border)] space-y-1">
          {showSiteLink ? (
            <Link
              href="/"
              onClick={onNavigate}
              className="flex items-center px-3 py-2 rounded-[var(--radius-lg)] text-sm text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] active:bg-[var(--color-secondary)] transition-colors"
            >
              ← На сайт
            </Link>
          ) : null}
          {showLogout ? (
            <LogoutButton className="flex items-center px-3 py-2 rounded-[var(--radius-lg)] text-sm text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] active:bg-[var(--color-secondary)] transition-colors w-full text-left" />
          ) : null}
        </div>
      )}
    </div>
  );
}

interface SidebarLinkProps {
  href: string;
  label: string;
  isActive: boolean;
  indent?: boolean;
  onNavigate?: () => void;
}

function SidebarLink({ href, label, isActive, indent = false, onNavigate }: SidebarLinkProps): React.ReactElement {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive ? "true" : undefined}
      className={`block ${indent ? "pl-8 pr-3" : "px-3"} py-2 rounded-[var(--radius-lg)] text-sm transition-colors active:bg-[var(--color-secondary)] ${
        isActive
          ? "bg-[var(--card-hover)] text-[var(--color-accent)] font-medium"
          : "hover:bg-[var(--card-hover)]"
      }`}
    >
      {label}
    </Link>
  );
}

interface SidebarGroupProps {
  group: AdminNavGroup;
  isOpen: boolean;
  onToggle: () => void;
  activeHref: string | null;
  pathname: string;
  onNavigate?: () => void;
}

function SidebarGroup({ group, isOpen, onToggle, activeHref, pathname, onNavigate }: SidebarGroupProps): React.ReactElement {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={group.id}
        className="flex items-center justify-between w-full px-3 py-2 rounded-[var(--radius-lg)] text-sm text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] active:bg-[var(--color-secondary)] transition-colors"
      >
        <span className="font-medium uppercase tracking-wider text-[11px]">
          {group.label}
        </span>
        <ChevronRight
          size={14}
          className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
          aria-hidden
        />
      </button>
      <div id={group.id} hidden={!isOpen} className="mt-1 space-y-1">
        {group.items.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            isActive={
              activeHref === item.href ||
              (activeHref === null && matchesHref(pathname, item.href))
            }
            onNavigate={onNavigate}
            indent
          />
        ))}
      </div>
    </div>
  );
}
