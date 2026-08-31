export const dynamic = "force-dynamic";

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import { pageSeo } from "@/lib/seo";
import { resolveOemSegment } from "@/lib/parts/oem-route";
import { VariantList, availableQty, type VariantForList } from "@/components/parts/VariantList";
import { AddToCartButton } from "@/components/parts/AddToCartButton";
import { ImageGallery } from "@/components/shared/ImageGallery";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { formatPrice } from "@/lib/utils";

interface Props {
  params: Promise<{ oem: string }>;
  /** `?v=<sku>` разворачивает конкретный вариант; в canonical не попадает. */
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface RawRefVariant extends VariantForList {
  slug: string;
  name: string;
  description: string | null;
  photos: string[];
}

interface RefDetail {
  id: string;
  oem: string;
  name: string;
  brand: string;
  groupName: string | null;
  notes: string | null;
  fitments: Array<{
    generation: {
      code: string;
      yearFrom: number;
      yearTo: number | null;
      model: { name: string; slug: string };
    };
  }>;
  parts: RawRefVariant[];
}

/** Один запрос на рендер и на метаданные. */
const getReferenceByOem = cache(async (oem: string) => {
  return db.partReference.findUnique({
    where: { oem },
    select: {
      id: true,
      oem: true,
      name: true,
      brand: true,
      groupName: true,
      notes: true,
      fitments: {
        select: {
          generation: {
            select: {
              code: true,
              yearFrom: true,
              yearTo: true,
              model: { select: { name: true, slug: true } },
            },
          },
        },
      },
      parts: {
        // Только живые: проданные экземпляры остаются в базе навсегда (на них
        // ссылаются заказы), и без фильтра ходовая деталь через год тянула бы
        // десятки мёртвых строк на каждый просмотр.
        where: { isActive: true },
        select: {
          id: true,
          slug: true,
          sku: true,
          name: true,
          description: true,
          price: true,
          condition: true,
          conditionNote: true,
          originNote: true,
          photos: true,
          // reserved НУЖЕН: у штучной б/у позиции резерв под открытой сметой
          // означает, что купить её нельзя (решение Р8).
          stockItems: { select: { quantity: true, reserved: true } },
        },
        orderBy: [{ condition: "asc" }, { createdAt: "asc" }],
      },
    },
  });
});

/** Выбранный вариант: `?v=<sku>`, иначе первый (новый идёт первым по orderBy). */
function pickShown(variants: RawRefVariant[], sku: string | null): RawRefVariant | null {
  if (variants.length === 0) return null;
  if (!sku) return variants[0];
  return variants.find((v) => v.sku === sku) ?? variants[0];
}

/** `?v=` из адреса; пустой параметр — отсутствие выбора, а не выбор пустого sku. */
function requestedSku(sp: { [key: string]: string | string[] | undefined } | undefined): string | null {
  const v = sp?.v;
  return typeof v === "string" && v !== "" ? v : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { oem } = await params;
  const sp = searchParams ? await searchParams : {};
  const decision = resolveOemSegment(oem);

  if (decision.kind === "notFound") {
    return pageSeo({
      title: "Деталь не найдена",
      description: "Номер детали не найден в каталоге Geleoteka.",
      path: `/parts/oem/${oem}`,
      noindex: true,
    });
  }
  // Для редиректа метаданные не увидят: страница уйдёт до рендера. Отдаём
  // канонический адрес, чтобы ничто не сослалось на промежуточный.
  const ref = (await getReferenceByOem(decision.oem)) as RefDetail | null;
  const path = `/parts/oem/${decision.oem}`;

  if (!ref) {
    return pageSeo({
      title: "Деталь не найдена",
      description: "Номер детали не найден в каталоге Geleoteka.",
      path,
      noindex: true,
    });
  }

  return pageSeo({
    title: `${ref.name} — ${ref.oem}`,
    description:
      ref.notes ??
      `${ref.name}, номер ${ref.oem}, для Mercedes-Benz G-Class. Новые и б/у детали в наличии и под заказ — Geleoteka.`,
    path,
    // Закрываем от индексации два случая, и НИ ОДИН из них не про остаток:
    //  • адрес с ?v= — он показывает конкретный экземпляр, а не деталь;
    //  • номенклатура без единого живого товара — пока на странице только
    //    название и номер, это тонкий контент, а таких позиций в справочнике
    //    сотни, и полутысяча пустых адресов вредит домену целиком. Индексация
    //    вернётся вместе с формой заявки — Story 6, часть 2.
    // Нулевой остаток НЕ закрывает: «под заказ» — законное предложение с ценой,
    // описанием и применяемостью, и это ровно тот длинный хвост запросов по
    // номеру, ради которого история и затевалась. Отсекать его значило бы
    // выбросить цель вместе с защитой от тонкого контента.
    noindex: requestedSku(sp) !== null || ref.parts.length === 0,
  });
}

export default async function PartByOemPage({ params, searchParams }: Props) {
  const { oem } = await params;
  const sp = searchParams ? await searchParams : {};
  const decision = resolveOemSegment(oem);

  if (decision.kind === "notFound") notFound();
  if (decision.kind === "redirect") {
    // Постоянный — и здесь это ЧЕСТНО, в отличие от редиректа вариантов в
    // Story 5: нормализованная форма номера не переезжает никогда, она
    // определяется самим номером, а не тем, какие товары сейчас заведены.
    permanentRedirect(`/parts/oem/${decision.oem}`);
  }

  const ref = (await getReferenceByOem(decision.oem)) as RefDetail | null;
  if (!ref) notFound();

  const variants = ref.parts;
  const shown = pickShown(variants, requestedSku(sp));
  const qty = shown ? availableQty(shown) : 0;

  const fitments = [...ref.fitments].sort((a, b) =>
    a.generation.code.localeCompare(b.generation.code),
  );

  return (
    <div className="container-page py-8">
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Запчасти", href: "/parts" },
          ...(ref.groupName ? [{ name: ref.groupName }] : []),
          { name: `${ref.name} · ${ref.oem}` },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        <div>
          {shown && shown.photos.length > 0 ? (
            <ImageGallery images={shown.photos} alt={shown.name} />
          ) : (
            <div className="aspect-square rounded-lg bg-[var(--background-secondary)] flex items-center justify-center text-[var(--foreground-muted)] text-sm">
              Фотографии появятся позже
            </div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)] mb-1">
            {ref.brand}
            {ref.groupName ? ` · ${ref.groupName}` : ""}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{ref.name}</h1>
          <p className="font-mono text-sm text-[var(--foreground-muted)] select-all mb-4">
            {ref.oem}
          </p>

          {shown ? (
            <>
              <p className="text-3xl font-bold text-[var(--color-accent)] mb-2">
                {formatPrice(shown.price)}
              </p>
              <p className="text-sm text-[var(--foreground-muted)] mb-4">
                {qty > 0
                  ? `В наличии — ${qty} шт.`
                  : shown.condition === "NEW"
                    ? "Под заказ"
                    : "Этот экземпляр уже продан"}
              </p>
              {shown.description && <p className="text-sm mb-4">{shown.description}</p>}
              <AddToCartButton
                part={{
                  id: shown.id,
                  slug: shown.slug,
                  name: shown.name,
                  // Артикул позиции — это и есть номер номенклатуры: у всех
                  // вариантов он общий, поэтому берём его у справочника.
                  article: ref.oem,
                  price: shown.price,
                  // Доступное, а не остаток: у штучной б/у позиции резерв
                  // означает, что купить её нельзя (Р8).
                  quantity: qty,
                  condition: shown.condition,
                }}
              />
            </>
          ) : (
            <div className="alert-error text-sm">
              Сейчас этой детали нет в наличии. Напишите нам — привезём под заказ.
            </div>
          )}
        </div>
      </div>

      <VariantList
        variants={variants}
        currentSku={shown?.sku ?? null}
        hrefFor={(v) => `/parts/oem/${ref.oem}?v=${encodeURIComponent(v.sku)}`}
      />

      {fitments.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Подходит к</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fitments.map((f) => (
              <Link
                key={f.generation.code}
                href={`/models/${f.generation.model.slug}`}
                className="card card-hover py-3 px-4 text-sm"
              >
                <div className="font-medium">
                  Mercedes-Benz {f.generation.model.name} · {f.generation.code}
                </div>
                <div className="text-xs text-[var(--foreground-muted)] mt-1">
                  {f.generation.yearFrom}–{f.generation.yearTo ?? "н.в."}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
