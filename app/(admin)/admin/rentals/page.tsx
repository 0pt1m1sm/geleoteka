export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { Button, PageHeader } from "@/components/ui";

export default async function AdminRentalsPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const cars = await db.vehicle.findMany({
    where: { ownershipType: "RENTAL", isArchived: false },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { rentalBookings: true } } },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Аренда"
        title="Автопарк"
        actions={
          <div className="flex gap-2">
            <Link href="/admin/rentals/bookings">
              <Button variant="secondary" size="sm">Бронирования</Button>
            </Link>
            <Link href="/admin/rentals/new">
              <Button size="sm" leftIcon={<Plus size={14} />}>Добавить авто</Button>
            </Link>
          </div>
        }
      />

      {cars.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Нет автомобилей в автопарке</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cars.map((car: Record<string, unknown>) => {
            const count = car._count as { rentalBookings: number };
            return (
              <Link
                key={car.id as string}
                href={`/admin/rentals/${car.id as string}`}
                className="card card-hover flex flex-col"
              >
                <h3 className="font-semibold text-lg mb-1">
                  Mercedes-Benz {car.model as string}
                </h3>
                <p className="text-sm text-[var(--foreground-muted)]">
                  {car.year as number} · {(car.color as string) || "—"} ·{" "}
                  {((car.mileage as number) || 0).toLocaleString("ru-RU")} км
                </p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                  <span className="font-bold text-[var(--color-accent)]">
                    {formatPrice((car.dailyRate as number) ?? 0)}/день
                  </span>
                  <span className="text-xs text-[var(--foreground-muted)]">
                    {count.rentalBookings} бронирований
                  </span>
                </div>
                <span
                  className={`badge text-[10px] mt-2 ${
                    car.isAvailable
                      ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                      : "bg-[var(--color-error-bg)] text-[var(--color-error)]"
                  }`}
                >
                  {car.isAvailable ? "Доступен" : "Недоступен"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
