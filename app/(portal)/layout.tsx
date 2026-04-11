import Link from "next/link";
import { LogoutButton } from "@/components/shared/LogoutButton";
import { PanelMobileNav } from "@/components/shared/PanelMobileNav";

const navItems = [
  { href: "/cabinet", label: "Главная" },
  { href: "/cabinet/cars", label: "Мои авто" },
  { href: "/cabinet/history", label: "История" },
  { href: "/cabinet/tracking", label: "Статус" },
  { href: "/cabinet/estimates", label: "Сметы" },
  { href: "/cabinet/orders", label: "Запчасти" },
  { href: "/cabinet/rentals", label: "Аренда" },
  { href: "/cabinet/loyalty", label: "Лояльность" },
  { href: "/cabinet/notifications", label: "Уведомления" },
];

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {/* Sidebar — desktop only */}
      <aside className="w-64 border-r border-[var(--border)] bg-[var(--card)] hidden md:flex flex-col">
        <div className="p-6 border-b border-[var(--border)]">
          <Link href="/" className="text-display text-lg font-bold">
            <span className="text-[var(--color-accent)]">Geleoteka</span>
          </Link>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">Личный кабинет</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-3 py-2 rounded-lg text-sm hover:bg-[var(--card-hover)] transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-[var(--border)]">
          <LogoutButton className="flex items-center px-3 py-2 rounded-lg text-sm text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] transition-colors w-full text-left" />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <PanelMobileNav title="Личный кабинет" navItems={navItems} basePath="/cabinet" />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
