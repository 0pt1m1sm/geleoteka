export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export default async function AdminRentalsPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const cars = await db.rentalCar.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { bookings: true } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-display text-2xl font-bold">Аренда — Автопарк</h1>
        <div className="flex gap-2">
          <Link href="/admin/rentals/bookings" className="btn btn-secondary text-sm">
            Бронирования
          </Link>
          <Link href="/admin/rentals/new" className="btn btn-primary text-sm">
            + Добавить авто
          </Link>
        </div>
      </div>

      {cars.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Нет автомобилей в автопарке</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cars.map((car: Record<string, unknown>) => {
            const count = car._count as { bookings: number };
            return (
              <div key={car.id as string} className="card">
                <h3 className="font-semibold text-lg mb-1">Mercedes-Benz {car.model as string}</h3>
                <p className="text-sm text-[var(--foreground-muted)]">
                  {car.year as number} · {car.color as string || "—"} · {((car.mileage as number) || 0).toLocaleString("ru-RU")} км
                </p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                  <span className="font-bold text-[var(--color-accent)]">
                    {formatPrice(car.dailyRate as number)}/день
                  </span>
                  <span className="text-xs text-[var(--foreground-muted)]">
                    {count.bookings} бронирований
                  </span>
                </div>
                <span className={`badge text-[10px] mt-2 ${(car.isAvailable as boolean) ? "bg-[var(--color-success-bg)] text-[var(--color-success)]" : "bg-[var(--color-error-bg)] text-[var(--color-error)]"}`}>
                  {(car.isAvailable as boolean) ? "Доступен" : "Недоступен"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
