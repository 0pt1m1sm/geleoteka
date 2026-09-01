export const dynamic = "force-dynamic";

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { getCMS } from "@/lib/cms";
import { trimLabel } from "@/lib/vehicle-catalog-types";
import { AddToCartButton } from "@/components/parts/AddToCartButton";
import { VariantList } from "@/components/parts/VariantList";
import { ImageGallery } from "@/components/shared/ImageGallery";
import { pageSeo } from "@/lib/seo";
import { buildProductJsonLd } from "@/lib/seo-jsonld";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";

interface Props {
  params: Promise<{ slug: string }>;
  /** `?v=<sku>` разворачивает конкретный вариант; в canonical не попадает. */
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * `?v=<sku>` из адреса, либо null.
 *
 * Пустой параметр (`?v=`) — это ОТСУТСТВИЕ выбора, а не выбор пустого sku.
 * Проверка «это строка» считала `""` выбором, и голый адрес хозяина с
 * обрезанным при пересылке хвостом получал noindex и ложное «экземпляр
 * продан». Одно место на обоих потребителей, чтобы правило не разъезжалось.
 */
function requestedVariantSku(
  sp: { [key: string]: string | string[] | undefined } | undefined,
): string | null {
  const v = sp?.v;
  return typeof v === "string" && v !== "" ? v : null;
}

/** Shared with generateMetadata so the detail lookup runs once per request. */
const getPartBySlug = cache(async (slug: string) => {
  return db.part.findUnique({
    where: { slug },
    include: {
      category: { select: { name: true, slug: true } },
      stockItems: { select: { quantity: true } },
      // Варианты той же детали: новый товар и б/у экземпляры делят
      // номенклатуру, и покупатель должен видеть выбор на одной странице.
      reference: {
        select: {
          id: true,
          // Номер номенклатуры — канонический адрес детали (решение Р1).
          oem: true,
          parts: {
            // Только активные: строки проданных экземпляров остаются в базе
            // навсегда (на них ссылаются заказы), и без фильтра ходовая деталь
            // через год тянула бы десятки мёртвых строк на каждый просмотр.
            // photos НУЖНЫ: при выбранном ?v= галерея показывает фотографии
            // именно этого экземпляра. Их наличие обязательно при заведении
            // б/у (доказательство состояния при возврате) — не показывать их
            // покупателю значит обесценить это правило.
            where: { isActive: true },
            select: {
              id: true,
              slug: true,
              sku: true,
              name: true,
              price: true,
              condition: true,
              conditionNote: true,
              originNote: true,
              photos: true,
              isActive: true,
              createdAt: true,
              // reserved — для показа доступного у штучных позиций (Р8).
              stockItems: { select: { quantity: true, reserved: true } },
            },
          },
        },
      },
      partTrims: {
        include: {
          trim: {
            include: {
              generation: {
                include: { model: { select: { name: true, slug: true } } },
              },
            },
          },
        },
      },
    },
  });
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : {};
  const part = await getPartBySlug(slug);
  const p = part as Record<string, unknown> | null;

  // condition — ВРЕМЕННО, до Story 3/5: иначе страница б/у отдаёт живой,
  // полностью индексируемый дубль карточки нового товара без canonical.
  if (!p || !p.isActive) {
    return pageSeo({
      title: "Запчасть не найдена",
      description:
        "Запрошенная запчасть не найдена. Посмотрите полный каталог оригинальных запчастей для Mercedes-Benz G-Class в Geleoteka.",
      path: `/parts/${slug}`,
      // noindex обязателен, потому что статус здесь НЕ 404, а 200.
      // Причина: `loading.tsx` на ветке /parts заставляет Next стримить ответ,
      // и статус фиксируется до того, как тело страницы вызовет notFound().
      // Проверено: с обоими loading.tsx маршрут отдаёт 200, без них — 404;
      // у услуг loading.tsx нет, и там 404 честный.
      // Пока файлы на месте, единственная защита от индексации «ненайденных»
      // адресов — этот флаг. Полное решение (снять loading.tsx и вернуть
      // настоящий 404 либо оставить скелетон осознанно) — за Story 5.
      noindex: true,
    });
  }

  // Канонический адрес — страница ХОЗЯИНА вариантов, а не текущая: новый товар
  // и б/у экземпляры это одна деталь, и конкурировать за один запрос они не
  // должны. Параметр ?v= в canonical не попадает никогда.
  // Р1: канонический адрес номенклатуры — ВСЕГДА страница по номеру детали.
  // Не «хозяин среди товаров»: тот зависел от наличия активного нового товара,
  // а оно меняется во времени — и канонический адрес переезжал бы вслед за
  // складом. Товары без номенклатуры (служебные артикулы «под заказ») своей
  // страницы по номеру не имеют и остаются сами себе каноном.
  const refMeta = p.reference as { oem: string } | null;
  const canonicalPath = refMeta ? `/parts/oem/${refMeta.oem}` : `/parts/${slug}`;

  return pageSeo({
    title: p.name as string,
    description:
      (p.description as string | null) ??
      `${p.name as string} (артикул ${p.article as string}) для Mercedes-Benz G-Class — купить в сервисе Geleoteka.`,
    path: canonicalPath,
    // ВАЖНО: noindex здесь НЕ выводится из «canonical не на себя». После Р1
    // канонический адрес не на себя у КАЖДОГО товара с номенклатурой, и
    // прежняя формула закрыла бы от индексации весь каталог разом. Хуже того,
    // canonical и noindex вместе — противоречивые указания: поисковик вправе
    // тогда проигнорировать canonical, и склейки не случится. Консолидирует
    // именно canonical, а noindex остаётся там, где адрес обречён:
    //  • б/у экземпляр — его страница умрёт с продажей;
    //  • адрес с ?v= — показывает конкретный экземпляр, а не деталь.
    noindex: (p.condition as string) !== "NEW" || requestedVariantSku(sp) !== null,
  });
}

interface RawPartTrim {
  trim: {
    id: string;
    code: string;
    bodyStyle: string | null;
    drivetrain: string | null;
    engineCode: string | null;
    isDefault: boolean;
    generation: {
      code: string;
      model: { name: string; slug: string };
    };
  };
}

interface RawVariant {
  id: string;
  slug: string;
  sku: string;
  name: string;
  price: number;
  condition: "NEW" | "USED" | "REFURBISHED";
  conditionNote: string | null;
  originNote: string | null;
  photos: string[];
  isActive: boolean;
  createdAt: Date;
  stockItems: Array<{ quantity: number }>;
}

interface CompatibilityRow {
  modelName: string;
  modelSlug: string;
  generationCode: string;
  trims: string[];
}

export default async function PartDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : {};
  const part = await getPartBySlug(slug);

  // Заглушка Story 2 снята: страница б/у больше не 404, потому что теперь у
  // детали есть карточка с вариантами и канонический адрес (см. ниже).
  const partRec = part as Record<string, unknown> | null;
  if (!partRec) notFound();

  const p = part as Record<string, unknown>;

  // Варианты этой же детали. Хозяин определяет канонический адрес; сюда же
  // приходят по ?v=<sku> с карточки в списке.
  const ref = p.reference as { parts: RawVariant[] } | null;
  const variants: RawVariant[] = (ref?.parts ?? []).filter((v) => v.isActive);

  // Р1 ЗАМЕНИЛ ПРАВИЛО. Раньше «хозяином» был активный новый товар среди
  // вариантов, и адрес детали переезжал вслед за складом. Теперь долговечный
  // адрес — страница по номеру, и сюда сходятся все следствия.
  //
  // Редирект СТОИТ ВЫШЕ проверки активности намеренно: б/у экземпляр
  // одноразовый, после продажи он гаснет, а расшаренная на него ссылка живёт.
  // Если сначала отсекать неактивные, такая ссылка упиралась бы в «Запчасть
  // не найдена» вместо страницы детали.
  const refOem = (p.reference as { oem: string } | null)?.oem ?? null;
  if (refOem) {
    const oemPath = `/parts/oem/${refOem}`;
    const isNew = (p.condition as string) === "NEW";

    if (!isNew) {
      // Р2 с поправкой ревью PR #109. Страница-цель после Р1 действительно не
      // переезжает — но АДРЕС цели переезжает, и это видно прямо здесь: пока
      // экземпляр жив, мы ведём на `?v=<sku>`, а после продажи — на голый
      // адрес. Переход гарантирован конструкцией: продажа гасит экземпляр
      // (Story 4), значит она случится у каждого. Заявлять «навсегда» о
      // цели, про смену которой известно из соседней строки, — то же
      // противоречие, из-за которого в Story 5 пришлось откатывать 308.
      //
      // Поэтому по сроку жизни цели, а не по факту переезда страницы:
      if (p.isActive) {
        // Экземпляр жив: адрес цели ещё изменится, когда его продадут.
        redirect(`${oemPath}?v=${encodeURIComponent(p.sku as string)}`);
      }
      // Продан: sku не переиспользуется, экземпляр не воскресает, цель
      // заморожена навсегда — вот теперь «навсегда» правда.
      permanentRedirect(oemPath);
    }

    if (!p.isActive) {
      // Р2: снятый с витрины НОВЫЙ товар — временно. Его включают обратно той
      // же галкой в админке, и «навсегда» оказалось бы ложью, которую уже не
      // отозвать: постоянный редирект кэшируется браузером и переиндексируется
      // поисковиком.
      redirect(oemPath);
    }
    // Активный новый товар РЕНДЕРИТСЯ: это полноценная карточка с описанием и
    // фотографиями, а склейку с адресом по номеру делает canonical. Закрывать
    // её редиректом значило бы выкинуть контент, ради которого её и заводили.
  }

  // Сюда доходит либо хозяин, либо деталь без активных вариантов вовсе.
  if (!p.isActive) notFound();

  // Адрес самовывоза читаем ПОСЛЕ редиректов: запросу, который уходит на
  // другой адрес, он не нужен, а лишний поход в CMS на каждый такой запрос —
  // это работа впустую.
  const pickupAddress = await getCMS("contacts.address", "");

  const requestedSku = requestedVariantSku(sp);
  const selected = requestedSku ? variants.find((v) => v.sku === requestedSku) : undefined;
  // Ссылка на проданный экземпляр не должна ронять страницу и не должна врать:
  // сообщаем, что его больше нет, и показываем то, что есть.
  const requestedMissing = requestedSku !== null && !selected;

  // Панель покупки показывает ВЫБРАННЫЙ вариант: иначе параметр разворачивал бы
  // блок, но купить всё равно предлагалось бы хозяина — то есть не то, по чему
  // покупатель пришёл.
  const shown = selected ?? null;
  const onHand = shown
    ? (shown.stockItems[0]?.quantity ?? 0)
    : ((p.stockItems as Array<{ quantity: number }>)[0]?.quantity ?? 0);
  const shownPrice = shown ? shown.price : (p.price as number);
  const shownId = shown ? shown.id : (p.id as string);
  const shownSlug = shown ? shown.slug : slug;
  const shownName = shown ? shown.name : (p.name as string);
  const shownCondition = shown
    ? shown.condition
    : (p.condition as "NEW" | "USED" | "REFURBISHED");
  // Частично применённый выбор хуже неприменённого: страница продавала бы
  // экземпляр по фотографиям и цене ДРУГОГО товара. Всё, что видит покупатель
  // и читает поисковик, берётся из одного источника.
  const shownPhotos = shown ? shown.photos : (p.photos as string[]);
  const shownCompareAt = shown ? null : (p.compareAtPrice as number | null);
  const shownSku = shown ? shown.sku : (p.sku as string);
  const cat = p.category as Record<string, string> | null;
  const partTrims = (p.partTrims as RawPartTrim[]) ?? [];

  // Group by (model, generation). Default-trim rows surface as "Все варианты"
  // so the customer can tell whether the part is generation-wide or specific.
  const compatibilityMap = new Map<string, CompatibilityRow>();
  for (const pt of partTrims) {
    const t = pt.trim;
    const key = `${t.generation.model.slug}|${t.generation.code}`;
    let row = compatibilityMap.get(key);
    if (!row) {
      row = {
        modelName: t.generation.model.name,
        modelSlug: t.generation.model.slug,
        generationCode: t.generation.code,
        trims: [],
      };
      compatibilityMap.set(key, row);
    }
    row.trims.push(trimLabel(t));
  }
  const compatibilityRows = Array.from(compatibilityMap.values()).sort((a, b) => {
    const cmp = a.modelName.localeCompare(b.modelName);
    if (cmp !== 0) return cmp;
    return a.generationCode.localeCompare(b.generationCode);
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: buildProductJsonLd({
            name: p.name as string,
            slug: slug,
            article: p.article as string,
            sku: shownSku,
            condition: shownCondition,
            description: p.description as string | null,
            price: shownPrice,
            image: shownPhotos[0] ?? null,
            inStock: onHand > 0,
          }),
        }}
      />
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Запчасти", href: "/parts" },
          ...(cat ? [{ name: cat.name, href: `/parts?category=${cat.slug}` }] : []),
          { name: p.name as string },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10">
        {/* Left column — image + details */}
        <div>
          {/* Product gallery */}
          <div className="mb-8">
            <ImageGallery images={shownPhotos} alt={shownName} aspectRatio="4/3" />
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
                <span className={`text-sm font-medium ${onHand > 0 ? "text-[var(--color-success)]" : "text-[var(--foreground-muted)]"}`}>
                  {onHand > 0
                    ? `В наличии — ${onHand} шт.`
                    : shownCondition === "NEW"
                      ? "Под заказ"
                      : "Продан"}
                </span>
              </div>
            </div>
          </div>

          {/* Варианты этой детали: новый товар и б/у экземпляры делят номер,
              и покупатель должен видеть выбор на одной странице, а не искать
              б/у отдельным поиском. */}
          {/* Сообщение об устаревшей ссылке — ВНЕ блока вариантов: самый частый
              случай «б/у продан, остался только новый» даёт ровно один вариант,
              и внутри блока сообщение бы не показалось. */}
          {requestedMissing && (
            <p className="mb-4 text-sm text-[var(--foreground-muted)]">
              Экземпляр, на который вела ссылка, уже продан. Ниже — то, что есть
              сейчас.
            </p>
          )}

          {/* Общий компонент с страницей по номеру: показывать одну деталь
              двумя разными способами значит гарантированно их рассинхронизировать.
              Ссылки ведут на страницу по номеру — после Р1 именно она
              разворачивает варианты, и вести на собственный адрес варианта
              значило бы отправлять человека в редирект. */}
          {refOem && variants.length > 1 && (
            <VariantList
              variants={variants}
              currentSku={p.sku as string}
              hrefFor={(v) => `/parts/oem/${refOem}?v=${encodeURIComponent(v.sku)}`}
            />
          )}

          {/* Compatible models */}
          {compatibilityRows.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Совместимые модели</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {compatibilityRows.map((row) => {
                  const allDefault = row.trims.length === 1 && row.trims[0] === "Все варианты этого поколения";
                  return (
                    <Link
                      key={`${row.modelSlug}-${row.generationCode}`}
                      href={`/models/${row.modelSlug}`}
                      className="card card-hover py-3 px-4 text-sm"
                    >
                      <div className="font-medium">
                        Mercedes-Benz {row.modelName} · {row.generationCode}
                      </div>
                      {!allDefault && (
                        <div className="text-xs text-[var(--foreground-muted)] mt-1">
                          {row.trims.join(", ")}
                        </div>
                      )}
                    </Link>
                  );
                })}
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
                  {formatPrice(shownPrice)}
                </span>
                {shownCompareAt ? (
                  <span className="text-lg text-[var(--foreground-muted)] line-through">
                    {formatPrice(shownCompareAt)}
                  </span>
                ) : null}
              </div>
              {shownCompareAt ? (
                <p className="text-sm text-[var(--color-success)] mt-1">
                  Экономия: {formatPrice(shownCompareAt - shownPrice)}
                </p>
              ) : null}
            </div>

            {/* Availability */}
            <div className={`flex items-center gap-2 mb-6 text-sm ${onHand > 0 ? "text-[var(--color-success)]" : "text-[var(--foreground-muted)]"}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${onHand > 0 ? "bg-[var(--color-success)]" : "bg-[var(--foreground-muted)]"}`} />
              {onHand > 0
                ? `В наличии — ${onHand} шт.`
                : shownCondition === "NEW"
                  ? "Под заказ (3-5 дней)"
                  : "Продан"}
            </div>

            {/* Add to cart */}
            <AddToCartButton
              part={{
                id: shownId,
                slug: shownSlug,
                name: shownName,
                article: p.article as string,
                price: shownPrice,
                quantity: onHand,
                condition: shownCondition,
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
              {/* Пустой адрес не рисуем: подпись «Самовывоз —» без значения
                  читается как поломка, а во время переезда поле может быть
                  пустым. */}
              {pickupAddress && (
                <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
                  <svg className="w-4 h-4 text-[var(--color-accent)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Самовывоз — {pickupAddress}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
