export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";
import { RentalStatusChanger } from "@/components/admin/RentalStatusChanger";
import { Card, PageHeader } from "@/components/ui";

export default async function RentalBookingsPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const bookings = await db.rentalBooking.findMany({
    include: {
      vehicle: { select: { model: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader eyebrow="Аренда" title="Бронирования аренды" />

      {bookings.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Бронирований пока нет</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((b: Record<string, unknown>) => {
            const vehicle = b.vehicle as { model: string };
            return (
              <div key={b.id as string} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      {b.contactName as string} — {vehicle.model}
                    </p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {formatDate(b.startDate as Date)} —{" "}
                      {formatDate(b.endDate as Date)}
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {b.contactPhone as string} · {b.contactEmail as string}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[var(--color-accent)]">
                      {formatPrice(b.totalCost as number)}
                    </p>
                    <RentalStatusChanger
                      bookingId={b.id as string}
                      currentStatus={b.status as string}
                    />
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
