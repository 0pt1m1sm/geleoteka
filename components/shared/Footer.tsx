import Link from "next/link";
import Image from "next/image";
import { Markdown } from "./Markdown";

export interface FooterServiceLink {
  label: string;
  href: string;
}

export interface FooterProps {
  servicePhone: string;
  email: string;
  address: string;
  description: string;
  servicesTitle: string;
  servicesItems: FooterServiceLink[];
  contactsTitle: string;
  copyright: string;
}

/** Public marketing footer. Other layers (portal, admin) don't render this. */
export function Footer({
  servicePhone,
  email,
  address,
  description,
  servicesTitle,
  servicesItems,
  contactsTitle,
  copyright,
}: FooterProps): React.ReactElement {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--background-secondary)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Image src="/images/logo.svg" alt="" width={28} height={28} />
              <span className="text-display text-lg font-bold text-[var(--color-accent)]">Geleoteka</span>
            </div>
            <div className="text-sm text-[var(--foreground-muted)] max-w-md">
              <Markdown source={description} />
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3">{servicesTitle}</h4>
            <ul className="space-y-2 text-sm text-[var(--foreground-muted)]">
              {servicesItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hover:text-[var(--foreground)] transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3">{contactsTitle}</h4>
            <ul className="space-y-2 text-sm text-[var(--foreground-muted)]">
              <li>
                <a
                  href={`tel:${servicePhone.replace(/[^+\d]/g, "")}`}
                  className="hover:text-[var(--foreground)] transition-colors"
                >
                  {servicePhone}
                </a>
              </li>
              <li>
                <a href={`mailto:${email}`} className="hover:text-[var(--foreground)] transition-colors">
                  {email}
                </a>
              </li>
              <li>{address}</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-[var(--border)] flex flex-col gap-2 text-center text-xs text-[var(--foreground-muted)]">
          <p>© {new Date().getFullYear()} {copyright}</p>
        </div>
      </div>
    </footer>
  );
}
