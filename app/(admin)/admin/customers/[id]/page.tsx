export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { APPOINTMENT_STATUS_LABELS, formatDate, formatPrice } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const customer = await db.user.findUnique({
    where: { id },
    include: {
      cars: true,
      loyaltyAccount: true,
      appointments: {
        include: {
          car: { select: { model: true } },
          services: { include: { service: { select: { name: true } } } },
          estimate: true,
        },
        orderBy: { dateTime: "desc" },
        take: 20,
      },
    },
  });

  if (!customer) notFound();

  const c = customer as Record<string, unknown>;
  const loyalty = c.loyaltyAccount as Record<string, unknown> | null;
  const cars = c.cars as Array<Record<string, unknown>>;
  const appointments = c.appointments as Array<Record<string, unknown>>;

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-2">
        {c.name as string}
      </h1>
      <p className="text-[var(--foreground-muted)] mb-6">
        {c.phone as string} · {c.email as string}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Автомобили</p>
          <p className="text-2xl font-bold">{cars.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Визиты</p>
          <p className="text-2xl font-bold">{appointments.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Баллы</p>
          <p className="text-2xl font-bold">{(loyalty?.points as number) ?? 0}</p>
        </div>
      </div>

      {/* Cars */}
      <h2 className="text-lg font-semibold mb-3">Автомобили</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {cars.map((car) => (
          <div key={car.id as string} className="card">
            <p className="font-medium">{car.model as string}, {car.year as number}</p>
            {car.vin ? <p className="text-xs text-[var(--foreground-muted)] font-mono">VIN: {car.vin as string}</p> : null}
          </div>
        ))}
      </div>

      {/* History */}
      <h2 className="text-lg font-semibold mb-3">История визитов</h2>
      <div className="space-y-3">
        {appointments.map((apt) => {
          const est = apt.estimate as Record<string, unknown> | null;
          return (
            <div key={apt.id as string} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{formatDate(apt.dateTime as Date)}</p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    {(apt.car as Record<string, string>).model}
                  </p>
                </div>
                <span className={`badge text-xs status-${(apt.status as string).toLowerCase()}`}>
                  {APPOINTMENT_STATUS_LABELS[apt.status as string] ?? apt.status}
                </span>
              </div>
              {est && (
                <p className="text-sm mt-2">
                  Стоимость: {formatPrice((est.finalCost as number) ?? (est.total as number))}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
