export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { Zap, Activity } from "lucide-react";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { PageHeader } from "@/components/ui";

export default async function RentalsPage() {
  const cars = await db.vehicle.findMany({
    where: { ownershipType: "RENTAL", isAvailable: true, isArchived: false },
    orderBy: { dailyRate: "asc" },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Аренда"
        title="Аренда G-Class"
        description="Арендуйте легендарный Mercedes-Benz G-Class на любой срок"
        align="center"
        className="mb-12"
      />

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
              <div className="relative aspect-video bg-[var(--background-secondary)] rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                {(car.photos as string[])?.length > 0 ? (
                  <Image
                    src={(car.photos as string[])[0]}
                    alt={`Mercedes-Benz ${car.model as string}`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-contain"
                  />
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
                      <Zap size={14} aria-hidden />
                      {car.engine as string}
                    </span>
                  ) : null}
                  {car.horsepower ? (
                    <span className="flex items-center gap-1">
                      <Activity size={14} aria-hidden />
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
