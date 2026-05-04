export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { MyCarPicker } from "@/components/parts/MyCarPicker";
import { MyCarStrip } from "@/components/parts/MyCarStrip";
import { PartsFilterSidebar, PartsFilterChips } from "@/components/parts/PartsFilterSidebar";
import { PartsSearchBox } from "@/components/parts/PartsSearchBox";

interface Props {
  searchParams: Promise<{
    q?: string;
    category?: string;
    oem?: string;
    inStock?: string;
    minPrice?: string;
    maxPrice?: string;
    model?: string;
    generation?: string;
    showAll?: string;
  }>;
}

export default async function PartsPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q?.trim() || "";
  const categorySlug = params.category || "";
  const oemOnly = params.oem === "true";
  const inStockOnly = params.inStock === "true";
  const minPrice = params.minPrice ? parseInt(params.minPrice) : null;
  const maxPrice = params.maxPrice ? parseInt(params.maxPrice) : null;
  const model = params.model || "";
  const generation = params.generation || "";
  const showAll = params.showAll === "1";
  const hasCarFilter = Boolean(model && generation && !showAll);

  const where: Record<string, unknown> = { isActive: true };

  if (q) {
    // Free-text search: name + article only. compatibleModels uses denormalized
    // "Model Generation" strings — Prisma's `has`/`hasSome` require exact array-element
    // matches and cannot do substring search. The picker is the canonical model entry point.
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { article: { contains: q, mode: "insensitive" } },
    ];
  }

  if (hasCarFilter) {
    where.compatibleModels = { has: `${model} ${generation}` };
  }

  if (categorySlug) {
    const cat = await db.partCategory.findUnique({ where: { slug: categorySlug } });
    if (cat) where.categoryId = (cat as Record<string, unknown>).id;
  }

  if (oemOnly) where.isOEM = true;
  if (inStockOnly) where.quantity = { gt: 0 };

  if (minPrice !== null || maxPrice !== null) {
    const priceFilter: Record<string, number> = {};
    if (minPrice !== null) priceFilter.gte = minPrice;
    if (maxPrice !== null) priceFilter.lte = maxPrice;
    where.price = priceFilter;
  }

  const [parts, categories] = await Promise.all([
    db.part.findMany({
      where,
      include: { category: { select: { name: true, slug: true } } },
      orderBy: { name: "asc" },
      take: 100,
    }),
    db.partCategory.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const cats = categories.map((c: Record<string, unknown>) => ({
    name: c.name as string,
    slug: c.slug as string,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center mb-8">
        <h1 className="text-display text-4xl font-bold mb-2">Запчасти</h1>
        <p className="text-[var(--foreground-muted)]">
          Оригинальные запчасти и качественные аналоги для Mercedes-Benz
        </p>
      </div>

      <MyCarStrip />
      {!hasCarFilter && !showAll ? <MyCarPicker /> : null}

      <div className="flex gap-6">
        <PartsFilterSidebar categories={cats} />

        <main className="flex-1 min-w-0">
          <PartsSearchBox currentQuery={q} />
          <PartsFilterChips categories={cats} />

          <div className="text-sm text-[var(--foreground-muted)] mb-4 flex items-center gap-3">
            <span>Найдено: {parts.length}</span>
            {showAll && (
              <span className="badge badge-silver text-xs">Показаны все запчасти</span>
            )}
          </div>

          {parts.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-[var(--foreground-muted)] mb-4">
                {hasCarFilter
                  ? "Под ваш автомобиль нет деталей в этой категории."
                  : "Ничего не найдено"}
              </p>
              {hasCarFilter && (
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href={`/parts?showAll=1${categorySlug ? `&category=${categorySlug}` : ""}`}
                    className="btn btn-primary"
                  >
                    Показать все запчасти
                  </Link>
                  <Link href="/booking" className="btn btn-secondary">
                    Заказать через сервис
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {parts.map((part: Record<string, unknown>) => {
                const cat = part.category as Record<string, string> | null;
                return (
                  <Link
                    key={part.id as string}
                    href={`/parts/${part.slug as string}`}
                    className="card card-hover group flex flex-col"
                  >
                    {/* Part image */}
                    <div className="aspect-square bg-[var(--background-secondary)] rounded-lg mb-3 flex flex-col items-center justify-center overflow-hidden relative">
                      {(part.photos as string[])?.length > 0 ? (
                        <img
                          src={(part.photos as string[])[0]}
                          alt={part.name as string}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          <span className="text-4xl font-black text-[var(--color-accent)] opacity-15">
                            G
                          </span>
                          <span className="text-[10px] font-mono text-[var(--foreground-muted)] opacity-40 mt-1">
                            {part.article as string}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`badge text-[10px] ${
                          (part.isOEM as boolean)
                            ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                            : "badge-silver"
                        }`}
                      >
                        {(part.isOEM as boolean) ? "OEM" : "Аналог"}
                      </span>
                      {cat && (
                        <span className="text-[10px] text-[var(--foreground-muted)]">
                          {cat.name}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium mb-1 group-hover:text-[var(--color-accent)] transition-colors flex-1">
                      {part.name as string}
                    </h3>
                    <p className="text-xs text-[var(--foreground-muted)] font-mono mb-2">
                      {part.article as string}
                    </p>
                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--border)]">
                      <div>
                        <span className="font-bold text-[var(--color-accent)]">
                          {formatPrice(part.price as number)}
                        </span>
                        {(part.compareAtPrice as number) ? (
                          <span className="text-xs text-[var(--foreground-muted)] line-through ml-2">
                            {formatPrice(part.compareAtPrice as number)}
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`text-xs ${
                          (part.quantity as number) > 0
                            ? "text-[var(--color-success)]"
                            : "text-[var(--foreground-muted)]"
                        }`}
                      >
                        {(part.quantity as number) > 0 ? "В наличии" : "Под заказ"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
