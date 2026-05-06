"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/shared/LogoutButton";
import { NavDrawer } from "@/components/shared/NavDrawer";
import {
  adminNav,
  findActiveGroupLabel,
  findActiveHref,
  type AdminNavGroup,
} from "@/lib/admin-nav";
import { useAccordionGroup } from "@/lib/use-accordion-group";

/** Mobile admin drawer with single-open accordion grouping. */
export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);
  const activeHref = findActiveHref(pathname, adminNav);
  const activeGroupLabel = findActiveGroupLabel(activeHref, adminNav);
  const [openGroup, toggleGroup] = useAccordionGroup(activeGroupLabel);

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

      <NavDrawer
        open={open}
        onClose={close}
        side="left"
        header={
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
        }
        footer={
          <>
            <Link
              href="/"
              onClick={close}
              className="block px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ color: "var(--foreground-muted)" }}
            >
              ← На сайт
            </Link>
            <LogoutButton className="block px-3 py-2 rounded-lg text-sm transition-colors w-full text-left" />
          </>
        }
      >
        {adminNav.map((entry) => {
          if (entry.kind === "link") {
            return (
              <DrawerLink
                key={entry.href}
                href={entry.href}
                label={entry.label}
                isActive={activeHref === entry.href}
                onNavigate={close}
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
              onNavigate={close}
            />
          );
        })}
      </NavDrawer>
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
