export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { AddToCartButton } from "@/components/parts/AddToCartButton";
import { ImageGallery } from "@/components/shared/ImageGallery";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PartDetailPage({ params }: Props) {
  const { slug } = await params;
  const part = await db.part.findUnique({
    where: { slug },
    include: { category: { select: { name: true, slug: true } } },
  });

  if (!part || !(part as Record<string, unknown>).isActive) notFound();

  const p = part as Record<string, unknown>;
  const cat = p.category as Record<string, string> | null;
  const models = p.compatibleModels as string[];
  const photos = p.photos as string[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-8 text-sm text-[var(--foreground-muted)]">
        <Link href="/" className="hover:text-[var(--foreground)]">Главная</Link>
        {" / "}
        <Link href="/parts" className="hover:text-[var(--foreground)]">Запчасти</Link>
        {cat && (
          <>
            {" / "}
            <Link href={`/parts?category=${cat.slug}`} className="hover:text-[var(--foreground)]">{cat.name}</Link>
          </>
        )}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10">
        {/* Left column — image + details */}
        <div>
          {/* Product gallery */}
          <div className="mb-8">
            <ImageGallery images={photos} alt={p.name as string} aspectRatio="4/3" />
          </div>

          {/* Product title + meta */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`badge text-xs ${(p.isOEM as boolean) ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20" : "badge-silver"}`}>
              {(p.isOEM as boolean) ? "OEM — Оригинал" : "Аналог"}
            </span>
            {cat && <span className="text-xs text-[var(--foreground-muted)]">{cat.name}</span>}
          </div>

          <h1 className="text-display text-2xl sm:text-3xl font-bold mb-2">{p.name as string}</h1>
          <p className="text-sm text-[var(--foreground-muted)] font-mono mb-8">Артикул: {p.article as string}</p>

          {/* Description */}
          {p.description ? (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Описание</h2>
              <div className="card">
                <p className="text-[var(--foreground-muted)] leading-relaxed">{p.description as string}</p>
              </div>
            </div>
          ) : null}

          {/* Specifications table */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Характеристики</h2>
            <div className="card divide-y divide-[var(--border)]">
              <div className="flex justify-between py-3">
                <span className="text-sm text-[var(--foreground-muted)]">Артикул</span>
                <span className="text-sm font-mono font-medium">{p.article as string}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-sm text-[var(--foreground-muted)]">Тип</span>
                <span className="text-sm font-medium">{(p.isOEM as boolean) ? "Оригинальная (OEM)" : "Аналог (aftermarket)"}</span>
              </div>
              {cat && (
                <div className="flex justify-between py-3">
                  <span className="text-sm text-[var(--foreground-muted)]">Категория</span>
                  <span className="text-sm font-medium">{cat.name}</span>
                </div>
              )}
              <div className="flex justify-between py-3">
                <span className="text-sm text-[var(--foreground-muted)]">Наличие</span>
                <span className={`text-sm font-medium ${(p.quantity as number) > 0 ? "text-[var(--color-success)]" : "text-[var(--foreground-muted)]"}`}>
                  {(p.quantity as number) > 0 ? `В наличии — ${p.quantity} шт.` : "Под заказ"}
                </span>
              </div>
            </div>
          </div>

          {/* Compatible models */}
          {models.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Совместимые модели</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {models.map((model: string) => (
                  <Link
                    key={model}
                    href={`/models/${model.toLowerCase().replace(/\s+/g, "-")}`}
                    className="card card-hover text-center py-3 text-sm font-medium"
                  >
                    Mercedes-Benz {model}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column — sticky buy card */}
        <div>
          <div className="card sticky top-20">
            {/* Price */}
            <div className="mb-4">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-[var(--color-accent)]">
                  {formatPrice(p.price as number)}
                </span>
                {(p.compareAtPrice as number) ? (
                  <span className="text-lg text-[var(--foreground-muted)] line-through">
                    {formatPrice(p.compareAtPrice as number)}
                  </span>
                ) : null}
              </div>
              {(p.compareAtPrice as number) ? (
                <p className="text-sm text-[var(--color-success)] mt-1">
                  Экономия: {formatPrice((p.compareAtPrice as number) - (p.price as number))}
                </p>
              ) : null}
            </div>

            {/* Availability */}
            <div className={`flex items-center gap-2 mb-6 text-sm ${(p.quantity as number) > 0 ? "text-[var(--color-success)]" : "text-[var(--foreground-muted)]"}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${(p.quantity as number) > 0 ? "bg-[var(--color-success)]" : "bg-[var(--foreground-muted)]"}`} />
              {(p.quantity as number) > 0 ? `В наличии — ${p.quantity} шт.` : "Под заказ (3-5 дней)"}
            </div>

            {/* Add to cart */}
            <AddToCartButton
              part={{
                id: p.id as string,
                slug: p.slug as string,
                name: p.name as string,
                article: p.article as string,
                price: p.price as number,
                quantity: p.quantity as number,
              }}
            />

            {/* Trust signals */}
            <div className="mt-6 pt-6 border-t border-[var(--border)] space-y-3">
              <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
                <svg className="w-4 h-4 text-[var(--color-accent)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Гарантия подлинности
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
                <svg className="w-4 h-4 text-[var(--color-accent)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Оплата при получении или переводом
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
                <svg className="w-4 h-4 text-[var(--color-accent)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Самовывоз — Москва, ул. Примерная, 15
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
