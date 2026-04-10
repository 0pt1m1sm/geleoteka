export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export default async function RentalsPage() {
  const cars = await db.rentalCar.findMany({
    where: { isAvailable: true },
    orderBy: { dailyRate: "asc" },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-display text-4xl sm:text-5xl font-bold mb-4">
          Аренда G-Class
        </h1>
        <p className="text-[var(--foreground-muted)] max-w-xl mx-auto text-lg">
          Арендуйте легендарный Mercedes-Benz G-Class на любой срок
        </p>
      </div>

      {cars.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Нет доступных автомобилей</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cars.map((car: Record<string, unknown>) => (
            <Link
              key={car.id as string}
              href={`/rentals/${car.id as string}`}
              className="card card-hover group flex flex-col"
            >
              <div className="aspect-video bg-[var(--background-secondary)] rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                {(car.photos as string[])?.length > 0 ? (
                  <img src={(car.photos as string[])[0]} alt={`Mercedes-Benz ${car.model as string}`} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-4xl text-[var(--foreground-muted)]/30">G</span>
                )}
              </div>
              <h2 className="text-xl font-bold group-hover:text-[var(--color-accent)] transition-colors">
                Mercedes-Benz {car.model as string}
              </h2>
              <p className="text-sm text-[var(--foreground-muted)] mb-3">
                {car.year as number} · {car.color as string || "—"} · {((car.mileage as number) || 0).toLocaleString("ru-RU")} км
              </p>
              {car.description ? (
                <p className="text-sm text-[var(--foreground-muted)] mb-4 flex-1 line-clamp-2">
                  {car.description as string}
                </p>
              ) : null}
              <div className="pt-3 border-t border-[var(--border)] mt-auto">
                <span className="text-2xl font-bold text-[var(--color-accent)]">
                  {formatPrice(car.dailyRate as number)}
                </span>
                <span className="text-sm text-[var(--foreground-muted)]"> / день</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
