"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/services", label: "Услуги" },
  { href: "/models", label: "Модели" },
  { href: "/parts", label: "Запчасти" },
  { href: "/rentals", label: "Аренда" },
  { href: "/about", label: "О нас" },
  { href: "/contacts", label: "Контакты" },
  { href: "/vacancies", label: "Вакансии" },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  const overlay = open ? (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        onClick={() => setOpen(false)}
      />
      {/* Panel — uses inline styles for background and text to guarantee
          they match the current theme regardless of Tailwind processing.
          var(--card) and var(--card-foreground) are defined in globals.css
          for both dark and light themes. */}
      <div
        className="fixed top-0 right-0 z-[60] h-full w-72 flex flex-col"
        style={{
          backgroundColor: "var(--card)",
          color: "var(--card-foreground)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-display font-black uppercase tracking-[0.1em]" style={{ color: "var(--color-accent)" }}>
            Geleoteka
          </span>
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

        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-3 rounded-lg text-sm transition-colors"
              style={{ color: "inherit" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--card-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          <Link
            href="/cabinet"
            onClick={() => setOpen(false)}
            className="block w-full text-center btn btn-secondary text-sm"
          >
            Личный кабинет
          </Link>
          <Link
            href="/booking"
            onClick={() => setOpen(false)}
            className="block w-full text-center btn btn-primary text-sm"
          >
            Записаться
          </Link>
          <div className="flex items-center justify-center pt-2">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className="md:hidden">
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

      {overlay && createPortal(overlay, document.body)}
    </div>
  );
}
