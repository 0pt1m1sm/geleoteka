export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";
import { RentalStatusChanger } from "@/components/admin/RentalStatusChanger";

export default async function RentalBookingsPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const bookings = await db.rentalBooking.findMany({
    include: {
      car: { select: { model: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">Бронирования аренды</h1>

      {bookings.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Бронирований пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b: Record<string, unknown>) => {
            const car = b.car as Record<string, string>;
            return (
              <div key={b.id as string} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{b.contactName as string} — {car.model}</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {formatDate(b.startDate as Date)} — {formatDate(b.endDate as Date)}
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {b.contactPhone as string} · {b.contactEmail as string}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[var(--color-accent)]">{formatPrice(b.totalCost as number)}</p>
                    <RentalStatusChanger bookingId={b.id as string} currentStatus={b.status as string} />
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
