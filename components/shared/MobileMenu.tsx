"use client";

import { useState } from "react";
import Link from "next/link";
import { NavDrawer } from "./NavDrawer";
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

export function MobileMenu({
  cabinetHref = "/cabinet",
  cabinetLabel = "Личный кабинет",
}: {
  cabinetHref?: string;
  cabinetLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);

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

      <NavDrawer
        open={open}
        onClose={close}
        side="right"
        header={
          <span
            className="text-display font-black uppercase tracking-[0.1em]"
            style={{ color: "var(--color-accent)" }}
          >
            Geleoteka
          </span>
        }
        footer={
          <>
            <Link
              href={cabinetHref}
              onClick={close}
              className="block w-full text-center btn btn-secondary text-sm"
            >
              {cabinetLabel}
            </Link>
            <Link
              href="/booking"
              onClick={close}
              className="block w-full text-center btn btn-primary text-sm"
            >
              Записаться
            </Link>
            <div className="flex items-center justify-center pt-2">
              <ThemeToggle />
            </div>
          </>
        }
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={close}
            className="block px-3 py-3 rounded-lg text-sm transition-colors"
            style={{ color: "inherit" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--card-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            {item.label}
          </Link>
        ))}
      </NavDrawer>
    </div>
  );
}
