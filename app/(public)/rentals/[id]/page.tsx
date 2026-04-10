export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { RentalBookingForm } from "@/components/rentals/RentalBookingForm";
import { ImageGallery } from "@/components/shared/ImageGallery";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RentalCarPage({ params }: Props) {
  const { id } = await params;
  const car = await db.rentalCar.findUnique({ where: { id } });

  if (!car || !(car as Record<string, unknown>).isAvailable) notFound();

  const c = car as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <div className="mb-6">
            <ImageGallery images={(c.photos as string[]) || []} alt={`Mercedes-Benz ${c.model as string}`} aspectRatio="16/9" />
          </div>
          <h1 className="text-display text-3xl font-bold mb-2">
            Mercedes-Benz {c.model as string}
          </h1>
          <p className="text-[var(--foreground-muted)] mb-4">
            {c.year as number} · {c.color as string || "—"} · {((c.mileage as number) || 0).toLocaleString("ru-RU")} км
          </p>
          {c.description ? (
            <div className="card mb-6">
              <p className="text-[var(--foreground-muted)] leading-relaxed">
                {c.description as string}
              </p>
            </div>
          ) : null}
          <div className="text-3xl font-bold text-[var(--color-accent)]">
            {formatPrice(c.dailyRate as number)}
            <span className="text-base text-[var(--foreground-muted)] font-normal"> / день</span>
          </div>
        </div>

        <div>
          <div className="card sticky top-24">
            <h2 className="font-semibold text-lg mb-4">Забронировать</h2>
            <RentalBookingForm
              carId={c.id as string}
              dailyRate={c.dailyRate as number}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
