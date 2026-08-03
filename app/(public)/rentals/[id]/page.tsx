export const dynamic = "force-dynamic";

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatPrice } from "@/lib/utils";
import { getCMS, getCMSList } from "@/lib/cms";
import { buildRentalJsonLd } from "@/lib/seo-jsonld";
import { RentalBookingForm } from "@/components/rentals/RentalBookingForm";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { ImageGallery } from "@/components/shared/ImageGallery";
import { pageSeo } from "@/lib/seo";

interface Props {
  params: Promise<{ id: string }>;
}

/** Shared with generateMetadata so the detail lookup runs once per request. */
// Пути SVG-иконок условий аренды по позиции пункта: щит (страховка), часы
// (поддержка), стрелки (доставка), карта (залог). Лишним пунктам — щит.
const TERM_ICON_PATHS = [
  "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
];

const getRentalVehicleById = cache(async (id: string) => {
  return db.vehicle.findFirst({
    where: { id, ownershipType: "RENTAL", isArchived: false },
  });
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const car = await getRentalVehicleById(id);
  const c = car as Record<string, unknown> | null;

  if (!c || !c.isAvailable) {
    return pageSeo({
      title: "Автомобиль не найден",
      description:
        "Запрошенный автомобиль недоступен для аренды. Посмотрите весь парк Mercedes-Benz G-Class, доступный для аренды в Geleoteka.",
      path: `/rentals/${id}`,
    });
  }

  return pageSeo({
    title: `Аренда Mercedes-Benz ${c.model as string} в Москве — от ${formatPrice(
      (c.dailyRate as number) ?? 0,
    )}/сутки`,
    description:
      `Аренда Гелендвагена ${c.model as string} ${c.year as number} года в Москве, с водителем и без: ` +
      "страховка КАСКО включена, подача в удобное место, бронирование онлайн.",
    path: `/rentals/${id}`,
  });
}

export default async function RentalCarPage({ params }: Props) {
  const { id } = await params;
  const car = await getRentalVehicleById(id);

  if (!car || !(car as Record<string, unknown>).isAvailable) notFound();

  const c = car as Record<string, unknown>;
  const photos = (c.photos as string[]) || [];
  const [terms, requirements] = await Promise.all([
    getCMSList("rentals.terms.items"),
    getCMSList("rentals.requirements.items"),
  ]);
  const features = (c.features as string[]) || [];

  // Active bookings ending today or later — those occupy future dates.
  // Cancelled/returned bookings free the vehicle.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bookings = (await db.rentalBooking.findMany({
    where: {
      vehicleId: id,
      status: { notIn: ["CANCELLED", "RETURNED"] },
      endDate: { gte: today },
    },
    select: { startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  })) as Array<{ startDate: Date; endDate: Date }>;
  const occupiedRanges = bookings.map((b) => ({
    start: b.startDate.toISOString().slice(0, 10),
    end: b.endDate.toISOString().slice(0, 10),
  }));

  const session = await getSession();
  const prefill = session
    ? { name: session.name, phone: session.phone, email: session.email }
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: buildRentalJsonLd({
            name: `Mercedes-Benz ${c.model as string}`,
            path: `/rentals/${c.id as string}`,
            dailyPrice: (c.dailyRate as number) ?? 0,
            description: c.description as string | null,
            image: photos[0] ?? null,
          }),
        }}
      />
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Аренда", href: "/rentals" },
          { name: `Mercedes-Benz ${c.model as string}` },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10">
        {/* Left column — image + details */}
        <div>
          {/* Car image gallery */}
          <div className="mb-8">
            <ImageGallery
              images={photos}
              alt={`Mercedes-Benz ${c.model as string}`}
              aspectRatio="16/9"
            />
          </div>

          {/* Title + meta */}
          <div className="flex items-center gap-2 mb-3">
            <span className="badge text-xs bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
              G-Class
            </span>
            <span className="text-xs text-[var(--foreground-muted)]">
              {c.year as number} год
            </span>
          </div>

          <h1 className="text-display text-2xl sm:text-3xl font-bold mb-2">
            Mercedes-Benz {c.model as string}
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mb-8">
            {c.color ? `${c.color as string} · ` : ""}
            {((c.mileage as number) || 0).toLocaleString("ru-RU")} км пробег
          </p>

          {/* Description */}
          {c.description ? (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Об автомобиле</h2>
              <div className="card">
                <p className="text-[var(--foreground-muted)] leading-relaxed">
                  {c.description as string}
                </p>
              </div>
            </div>
          ) : null}

          {/* Specifications */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Характеристики</h2>
            <div className="card divide-y divide-[var(--border)]">
              {c.engine ? (
                <div className="flex justify-between py-3">
                  <span className="text-sm text-[var(--foreground-muted)]">Двигатель</span>
                  <span className="text-sm font-medium">{c.engine as string}</span>
                </div>
              ) : null}
              {c.horsepower ? (
                <div className="flex justify-between py-3">
                  <span className="text-sm text-[var(--foreground-muted)]">Мощность</span>
                  <span className="text-sm font-medium">{c.horsepower as number} л.с.</span>
                </div>
              ) : null}
              {c.transmission ? (
                <div className="flex justify-between py-3">
                  <span className="text-sm text-[var(--foreground-muted)]">Коробка передач</span>
                  <span className="text-sm font-medium">{c.transmission as string}</span>
                </div>
              ) : null}
              <div className="flex justify-between py-3">
                <span className="text-sm text-[var(--foreground-muted)]">Год выпуска</span>
                <span className="text-sm font-medium">{c.year as number}</span>
              </div>
              {c.color ? (
                <div className="flex justify-between py-3">
                  <span className="text-sm text-[var(--foreground-muted)]">Цвет</span>
                  <span className="text-sm font-medium">{c.color as string}</span>
                </div>
              ) : null}
              <div className="flex justify-between py-3">
                <span className="text-sm text-[var(--foreground-muted)]">Пробег</span>
                <span className="text-sm font-medium">
                  {((c.mileage as number) || 0).toLocaleString("ru-RU")} км
                </span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-sm text-[var(--foreground-muted)]">Количество мест</span>
                <span className="text-sm font-medium">{(c.seats as number) || 5}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-sm text-[var(--foreground-muted)]">Привод</span>
                <span className="text-sm font-medium">Полный (4MATIC)</span>
              </div>
            </div>
          </div>

          {/* Features */}
          {features.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Комплектация</h2>
              <div className="card">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {features.map((feature: string) => (
                    <div
                      key={feature}
                      className="flex items-center gap-3 text-sm text-[var(--foreground-muted)]"
                    >
                      <svg
                        className="w-4 h-4 text-[var(--color-accent)] shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Rental terms — тексты из CMS (Аренда → условия), иконки по позиции */}
          {terms.length > 0 ? (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Условия аренды</h2>
              <div className="card space-y-4 text-sm text-[var(--foreground-muted)]">
                {terms.map((term, i) => (
                  <div key={`${term.title}-${i}`} className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-[var(--color-accent)] shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={TERM_ICON_PATHS[i] ?? TERM_ICON_PATHS[0]}
                      />
                    </svg>
                    <div>
                      <p className="text-[var(--foreground)] font-medium mb-0.5">{term.title}</p>
                      <p className="text-xs">{term.subtitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Requirements — из CMS (Аренда → требования к водителю) */}
          {requirements.length > 0 ? (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Требования к водителю</h2>
              <div className="card">
                <ul className="space-y-2 text-sm text-[var(--foreground-muted)]">
                  {requirements.map((req, i) => (
                    <li key={`${req.text}-${i}`} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                      {req.text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right column — sticky booking card */}
        <div>
          <div className="card sticky top-20">
            {/* Price */}
            <div className="mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-[var(--color-accent)]">
                  {formatPrice((c.dailyRate as number) ?? 0)}
                </span>
                <span className="text-sm text-[var(--foreground-muted)]">/ сутки</span>
              </div>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                Скидка 10% при аренде от 7 дней
              </p>
            </div>

            {/* Availability */}
            <div className="flex items-center gap-2 mb-6 text-sm text-[var(--color-success)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)]" />
              Доступен для бронирования
            </div>

            {/* Booking form */}
            <RentalBookingForm
              carId={c.id as string}
              dailyRate={(c.dailyRate as number) ?? 0}
              occupiedRanges={occupiedRanges}
              prefill={prefill}
            />

            {/* Trust signals */}
            <div className="mt-6 pt-6 border-t border-[var(--border)] space-y-3">
              <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
                <svg
                  className="w-4 h-4 text-[var(--color-accent)] shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                Страховка КАСКО включена
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
                <svg
                  className="w-4 h-4 text-[var(--color-accent)] shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Поддержка 24/7
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
                <svg
                  className="w-4 h-4 text-[var(--color-accent)] shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Выдача — {await getCMS("contacts.address", "Москва, ул. Примерная, 15")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
