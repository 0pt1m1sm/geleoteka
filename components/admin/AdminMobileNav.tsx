"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/shared/LogoutButton";
import {
  adminNav,
  findActiveGroupLabel,
  findActiveHref,
  type AdminNavGroup,
} from "@/lib/admin-nav";

// Manual toggle state tied to a specific pathname. See AdminSidebar.tsx for
// the full explanation of this pattern (avoids setState-in-effect).
interface ManualOverride {
  pathname: string;
  openLabel: string | null;
}

/** Mobile admin drawer with single-open accordion grouping. */
export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<ManualOverride | null>(null);

  const activeHref = findActiveHref(pathname, adminNav);
  const activeGroupLabel = findActiveGroupLabel(activeHref, adminNav);

  const activeOverride =
    override && override.pathname === pathname ? override : null;
  const openGroup = activeOverride ? activeOverride.openLabel : activeGroupLabel;

  function toggleGroup(label: string): void {
    setOverride({
      pathname,
      openLabel: openGroup === label ? null : label,
    });
  }

  function closeDrawer(): void {
    setOpen(false);
  }

  const overlay = open ? (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        onClick={closeDrawer}
      />
      <div
        className="fixed top-0 left-0 z-[60] h-full w-72 flex flex-col"
        style={{
          backgroundColor: "var(--card)",
          color: "var(--card-foreground)",
          borderRight: "1px solid var(--border)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <span
              className="text-display text-lg font-bold"
              style={{ color: "var(--color-accent)" }}
            >
              Geleoteka
            </span>
            <p className="text-xs" style={{ color: "var(--color-gold)" }}>
              Админ-панель
            </p>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            className="p-2"
            style={{ color: "var(--foreground-muted)" }}
            aria-label="Закрыть меню"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {adminNav.map((entry) => {
            if (entry.kind === "link") {
              return (
                <DrawerLink
                  key={entry.href}
                  href={entry.href}
                  label={entry.label}
                  isActive={activeHref === entry.href}
                  onNavigate={closeDrawer}
                />
              );
            }
            return (
              <DrawerGroup
                key={entry.id}
                group={entry}
                isOpen={openGroup === entry.label}
                onToggle={() => toggleGroup(entry.label)}
                activeHref={activeHref}
                onNavigate={closeDrawer}
              />
            );
          })}
        </nav>

        <div
          className="p-4 space-y-1"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <Link
            href="/"
            onClick={closeDrawer}
            className="block px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ color: "var(--foreground-muted)" }}
          >
            ← На сайт
          </Link>
          <LogoutButton className="block px-3 py-2 rounded-lg text-sm transition-colors w-full text-left" />
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className="md:hidden">
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 h-14"
        style={{
          backgroundColor: "var(--card)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-2"
          style={{ color: "var(--foreground-muted)" }}
          aria-label="Открыть меню"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
          Админ-панель
        </span>
        <div className="w-10" />
      </header>

      {overlay && createPortal(overlay, document.body)}
    </div>
  );
}

function DrawerLink({
  href,
  label,
  isActive,
  onNavigate,
  indent = false,
}: {
  href: string;
  label: string;
  isActive: boolean;
  onNavigate: () => void;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`block ${indent ? "pl-8 pr-3" : "px-3"} py-3 rounded-lg text-sm transition-colors`}
      style={{
        backgroundColor: isActive ? "var(--card-hover)" : "transparent",
        color: isActive ? "var(--color-accent)" : "inherit",
        fontWeight: isActive ? 500 : 400,
      }}
    >
      {label}
    </Link>
  );
}

function DrawerGroup({
  group,
  isOpen,
  onToggle,
  activeHref,
  onNavigate,
}: {
  group: AdminNavGroup;
  isOpen: boolean;
  onToggle: () => void;
  activeHref: string | null;
  onNavigate: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`mobile-${group.id}`}
        className="flex items-center justify-between w-full px-3 py-3 rounded-lg text-sm transition-colors"
        style={{ color: "var(--foreground-muted)" }}
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
      <div id={`mobile-${group.id}`} hidden={!isOpen} className="mt-1 space-y-1">
        {group.items.map((item) => (
          <DrawerLink
            key={item.href}
            href={item.href}
            label={item.label}
            isActive={activeHref === item.href}
            onNavigate={onNavigate}
            indent
          />
        ))}
      </div>
    </div>
  );
}

