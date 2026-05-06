"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/shared/LogoutButton";
import { NavDrawer } from "./NavDrawer";

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
  const close = (): void => setOpen(false);
  const pathname = usePathname();

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

      <NavDrawer
        open={open}
        onClose={close}
        side="left"
        header={
          <div>
            <span className="text-display text-lg font-bold" style={{ color: "var(--color-accent)" }}>
              Geleoteka
            </span>
            <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>{title}</p>
          </div>
        }
        footer={
          <>
            {showSiteLink && (
              <Link
                href="/"
                onClick={close}
                className="block px-3 py-2 rounded-lg text-sm transition-colors"
                style={{ color: "var(--foreground-muted)" }}
              >
                ← На сайт
              </Link>
            )}
            <LogoutButton className="block px-3 py-2 rounded-lg text-sm transition-colors w-full text-left" />
          </>
        }
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== basePath && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
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
      </NavDrawer>
    </div>
  );
}
