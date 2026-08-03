import Link from "next/link";

import {
  buildBreadcrumbJsonLd,
  type BreadcrumbItem,
} from "@/lib/seo-jsonld";

/**
 * Хлебные крошки: один компонент вместо четырёх инлайн-копий одинакового
 * <nav>. Кроме визуала отдаёт BreadcrumbList JSON-LD — Яндекс подставляет
 * такую цепочку в сниппет вместо сырого URL, что заметно поднимает CTR.
 * Последний элемент — текущая страница: без ссылки и без item в разметке.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }): React.ReactElement {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildBreadcrumbJsonLd(items) }}
      />
      <nav aria-label="Хлебные крошки" className="mb-8 text-sm text-[var(--foreground-muted)]">
        {items.map((item, i) => (
          <span key={`${item.name}-${i}`}>
            {i > 0 ? " / " : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-[var(--foreground)]">
                {item.name}
              </Link>
            ) : (
              <span className="text-[var(--foreground)]">{item.name}</span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
