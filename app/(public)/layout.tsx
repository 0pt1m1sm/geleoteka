import Link from "next/link";
import Image from "next/image";
import { FloatingButtons } from "@/components/shared/FloatingButtons";
import { MobileMenu } from "@/components/shared/MobileMenu";
import { CookieConsent } from "@/components/shared/CookieConsent";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { getSession } from "@/lib/auth";
import { getCMSMany } from "@/lib/cms";

const FOOTER_CMS_KEYS = [
  "contacts.phone.service",
  "contacts.email",
  "contacts.address",
] as const;

const FOOTER_CMS_FALLBACKS: Record<string, string> = {
  "contacts.phone.service": "+7 (495) 123-45-67",
  "contacts.email": "info@geleoteka.ru",
  "contacts.address": "Москва, ул. Примерная, 15",
};

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, cms] = await Promise.all([
    getSession(),
    getCMSMany(FOOTER_CMS_KEYS, FOOTER_CMS_FALLBACKS),
  ]);
  const isStaff = session?.permissionRole === "ADMIN" || session?.permissionRole === "MANAGER";
  const cabinetHref = isStaff ? "/admin" : "/cabinet";
  const cabinetLabel = isStaff ? "Админ-панель" : "Кабинет";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--color-accent)]/20 bg-[var(--background)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/images/logo.svg" alt="G" width={32} height={32} />
            <span className="text-display text-lg font-black tracking-[0.1em] uppercase text-[var(--color-accent)] hidden sm:inline">
              Geleoteka
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/services" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
              Услуги
            </Link>
            <Link href="/parts" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
              Запчасти
            </Link>
            <Link href="/rentals" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
              Аренда
            </Link>
            <Link href="/about" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
              О нас
            </Link>
            <Link href="/contacts" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
              Контакты
            </Link>
            <Link href="/parts/cart" className="p-2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors relative" aria-label="Корзина">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </Link>
            <ThemeToggle />
            <Link href={cabinetHref} className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
              {cabinetLabel}
            </Link>
            <Link
              href="/booking"
              className="btn btn-primary text-sm"
            >
              Записаться
            </Link>
          </nav>
          <MobileMenu cabinetHref={cabinetHref} cabinetLabel={cabinetLabel} />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[var(--border)] bg-[var(--background-secondary)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <Image src="/images/logo.svg" alt="G" width={28} height={28} />
                <span className="text-display text-lg font-bold text-[var(--color-accent)]">Geleoteka</span>
              </div>
              <p className="text-sm text-[var(--foreground-muted)] max-w-md">
                Специализированный сервис Mercedes-Benz. Опыт работы более 15 лет,
                сертифицированные мастера, оригинальные запчасти.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Услуги</h4>
              <ul className="space-y-2 text-sm text-[var(--foreground-muted)]">
                <li><Link href="/services/to">Техобслуживание</Link></li>
                <li><Link href="/services/diagnostic">Диагностика</Link></li>
                <li><Link href="/services/repair">Ремонт</Link></li>
                <li><Link href="/services">Все услуги →</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Контакты</h4>
              <ul className="space-y-2 text-sm text-[var(--foreground-muted)]">
                <li>
                  <a href={`tel:${cms["contacts.phone.service"].replace(/[^+\d]/g, "")}`} className="hover:text-[var(--foreground)] transition-colors">
                    {cms["contacts.phone.service"]}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${cms["contacts.email"]}`} className="hover:text-[var(--foreground)] transition-colors">
                    {cms["contacts.email"]}
                  </a>
                </li>
                <li>{cms["contacts.address"]}</li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-[var(--border)] text-center text-sm text-[var(--foreground-muted)]">
            © {new Date().getFullYear()} Geleoteka. Все права защищены.
          </div>
        </div>
      </footer>
      <FloatingButtons />
      <CookieConsent />
    </>
  );
}
