"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

function getTheme() {
  if (typeof window === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function subscribeTheme(cb: () => void) {
  const observer = new MutationObserver(cb);
  if (typeof document !== "undefined") {
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  return () => observer.disconnect();
}

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
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "dark");
  const panelBg = theme === "light" ? "#ffffff" : "#141414";

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-2 text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
        aria-label="Открыть меню"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/60"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <div className="fixed top-0 right-0 z-[60] h-full w-72 border-l border-[var(--border)] animate-slide-in flex flex-col shadow-2xl" style={{ backgroundColor: panelBg }}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <span className="text-display font-black uppercase tracking-[0.1em] text-[var(--color-accent)]">
                Geleoteka
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 text-[var(--foreground-muted)]"
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
                  className="block px-3 py-3 rounded-lg text-sm hover:bg-[var(--card-hover)] transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="p-4 border-t border-[var(--border)] space-y-2">
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
      )}
    </div>
  );
}
