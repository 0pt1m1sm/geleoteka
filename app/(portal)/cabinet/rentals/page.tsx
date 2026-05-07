export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ожидает",
  CONFIRMED: "Подтверждена",
  ACTIVE: "Активна",
  RETURNED: "Завершена",
  CANCELLED: "Отменена",
};

export default async function MyRentalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const bookings = await db.rentalBooking.findMany({
    where: { userId: session.id },
    include: { vehicle: { select: { model: true, year: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader eyebrow="Кабинет" title="Мои аренды" />

      {bookings.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Бронирований пока нет</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((b: Record<string, unknown>) => {
            const vehicle = b.vehicle as { model: string; year: number };
            return (
              <div key={b.id as string} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">Mercedes-Benz {vehicle.model} ({vehicle.year})</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {formatDate(b.startDate as Date)} — {formatDate(b.endDate as Date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[var(--color-accent)]">{formatPrice(b.totalCost as number)}</p>
                    <span className="badge text-[10px] bg-[var(--color-info-bg)] text-[var(--color-info)]">
                      {STATUS_LABELS[b.status as string] ?? b.status}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
