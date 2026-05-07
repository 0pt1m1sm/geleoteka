"use client";

import Link from "next/link";
import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import type { AdminNavEntry } from "@/lib/admin-nav";

export interface PublicHeaderProps {
  variant: "public";
  cabinetHref: string;
  cabinetLabel: string;
}

export interface PanelHeaderProps {
  variant: "portal" | "admin";
  brandLabel: string;
  nav: readonly AdminNavEntry[];
}

export type HeaderProps = PublicHeaderProps | PanelHeaderProps;

const PUBLIC_NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/services", label: "Услуги" },
  { href: "/parts", label: "Запчасти" },
  { href: "/rentals", label: "Аренда" },
  { href: "/about", label: "О нас" },
  { href: "/contacts", label: "Контакты" },
];

const PUBLIC_MOBILE_NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/services", label: "Услуги" },
  { href: "/models", label: "Модели" },
  { href: "/parts", label: "Запчасти" },
  { href: "/rentals", label: "Аренда" },
  { href: "/about", label: "О нас" },
  { href: "/contacts", label: "Контакты" },
  { href: "/vacancies", label: "Вакансии" },
];

/**
 * Header — variant-aware site header.
 *   - public: full marketing nav (desktop) + mobile menu drawer
 *   - portal/admin: thin top bar with mobile-nav trigger; sidebar handles desktop nav
 */
export function Header(props: HeaderProps): React.ReactElement {
  if (props.variant === "public") {
    return <PublicHeader {...props} />;
  }
  return <PanelHeader {...props} />;
}

function PublicHeader({ cabinetHref, cabinetLabel }: PublicHeaderProps): React.ReactElement {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-accent)]/20 bg-[var(--background)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/images/logo.svg" alt="" width={32} height={32} priority />
          <span className="text-display text-lg font-black tracking-[0.1em] uppercase text-[var(--color-accent)] hidden sm:inline">
            Geleoteka
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6" aria-label="Главная навигация">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/parts/cart"
            className="p-2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Корзина"
          >
            <ShoppingCart size={20} aria-hidden />
          </Link>
          <ThemeToggle />
          <Link href={cabinetHref} className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
            {cabinetLabel}
          </Link>
          <Link href="/booking" className="btn btn-primary text-sm">
            Записаться
          </Link>
        </nav>
        <div className="md:hidden flex items-center gap-2">
          <Link
            href="/parts/cart"
            className="p-2 text-[var(--foreground-muted)]"
            aria-label="Корзина"
          >
            <ShoppingCart size={20} aria-hidden />
          </Link>
          <PublicMobileMenu cabinetHref={cabinetHref} cabinetLabel={cabinetLabel} />
        </div>
      </div>
    </header>
  );
}

function PublicMobileMenu({
  cabinetHref,
  cabinetLabel,
}: {
  cabinetHref: string;
  cabinetLabel: string;
}): React.ReactElement {
  return (
    <MobileNav title="Geleoteka" ariaTitle="Главное меню">
      {(close) => (
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {PUBLIC_MOBILE_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="block px-3 py-3 rounded-[var(--radius-lg)] text-sm hover:bg-[var(--card-hover)] transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="p-4 space-y-2 border-t border-[var(--border)]">
            <Link href={cabinetHref} onClick={close} className="block w-full text-center btn btn-secondary text-sm">
              {cabinetLabel}
            </Link>
            <Link href="/booking" onClick={close} className="block w-full text-center btn btn-primary text-sm">
              Записаться
            </Link>
            <div className="flex items-center justify-center pt-2">
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </MobileNav>
  );
}

function PanelHeader({ brandLabel, nav }: PanelHeaderProps): React.ReactElement {
  return (
    <MobileNav title={brandLabel} ariaTitle={brandLabel}>
      {(close) => <Sidebar nav={nav} brandLabel={brandLabel} onNavigate={close} />}
    </MobileNav>
  );
}
