"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/shared/LogoutButton";

interface NavItem {
  href: string;
  label: string;
}

interface PanelMobileNavProps {
  title: string;
  navItems: NavItem[];
  basePath: string;
  showSiteLink?: boolean;
}

export function PanelMobileNav({ title, navItems, basePath, showSiteLink = true }: PanelMobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const overlay = open ? (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        onClick={() => setOpen(false)}
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
            <span className="text-display text-lg font-bold" style={{ color: "var(--color-accent)" }}>
              Geleoteka
            </span>
            <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>{title}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2"
            style={{ color: "var(--foreground-muted)" }}
            aria-label="Закрыть меню"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== basePath && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-3 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: isActive ? "var(--card-hover)" : "transparent",
                  color: isActive ? "var(--color-accent)" : "inherit",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 space-y-1" style={{ borderTop: "1px solid var(--border)" }}>
          {showSiteLink && (
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ color: "var(--foreground-muted)" }}
            >
              ← На сайт
            </Link>
          )}
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
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
          {title}
        </span>
        <div className="w-10" />
      </header>

      {overlay && createPortal(overlay, document.body)}
    </div>
  );
}
