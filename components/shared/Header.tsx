"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "./Drawer";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { CartIconLink } from "./CartIconLink";
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
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/images/logo.svg" alt="" width={32} height={32} priority />
          <span className="text-display text-lg font-black tracking-[0.1em] uppercase text-[var(--color-accent)] hidden lg:inline">
            Geleoteka
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-4 lg:gap-6" aria-label="Главная навигация">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
          <CartIconLink />
          <ThemeToggle />
          <Link href={cabinetHref} className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap">
            {cabinetLabel}
          </Link>
          <Link href="/booking" className="btn btn-primary text-sm whitespace-nowrap">
            Записаться
          </Link>
        </nav>
        <div className="md:hidden flex items-center gap-1">
          <CartIconLink />
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
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger className="btn-icon" aria-label="Открыть меню">
        <Menu size={22} aria-hidden />
      </DrawerTrigger>
      <DrawerContent side="right">
        <DrawerTitle className="sr-only">Главное меню</DrawerTitle>
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {PUBLIC_MOBILE_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="block px-3 py-3 rounded-[var(--radius-lg)] text-sm hover:bg-[var(--card-hover)] active:bg-[var(--color-secondary)] transition-colors"
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
      </DrawerContent>
    </Drawer>
  );
}

function PanelHeader({ brandLabel, nav }: PanelHeaderProps): React.ReactElement {
  return (
    <MobileNav title={brandLabel} ariaTitle={brandLabel}>
      {(close) => <Sidebar nav={nav} brandLabel={brandLabel} onNavigate={close} />}
    </MobileNav>
  );
}
