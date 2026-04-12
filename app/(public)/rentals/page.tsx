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
              <p className="text-xs text-[var(--foreground-muted)] mb-3">
                {car.year as number} · {car.color as string || "—"} · {((car.mileage as number) || 0).toLocaleString("ru-RU")} км
              </p>

              {/* Specs preview */}
              {(car.engine || car.horsepower) ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mb-4 text-xs text-[var(--foreground-muted)]">
                  {car.engine ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {car.engine as string}
                    </span>
                  ) : null}
                  {car.horsepower ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      {car.horsepower as number} л.с.
                    </span>
                  ) : null}
                </div>
              ) : null}

              {car.description ? (
                <p className="text-sm text-[var(--foreground-muted)] mb-4 flex-1 line-clamp-2">
                  {car.description as string}
                </p>
              ) : (
                <div className="flex-1" />
              )}
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
