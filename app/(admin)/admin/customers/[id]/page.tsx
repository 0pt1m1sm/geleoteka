export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { REPAIR_ORDER_STATUS_LABELS, formatDate, formatPrice } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }
  const { id } = await params;

  const customer = await db.user.findUnique({
    where: { id },
    include: {
      vehicles: { where: { ownershipType: "CUSTOMER" } },
      loyaltyAccount: true,
      repairOrders: {
        include: {
          vehicle: { select: { model: true } },
          jobLines: { select: { description: true, status: true } },
        },
        orderBy: { dateTime: "desc" },
        take: 20,
      },
    },
  });

  if (!customer) notFound();

  const c = customer as Record<string, unknown>;
  const loyalty = c.loyaltyAccount as { points: number } | null;
  const vehicles = c.vehicles as Array<Record<string, unknown>>;
  const repairOrders = c.repairOrders as Array<Record<string, unknown>>;

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-2">{c.name as string}</h1>
      <p className="text-[var(--foreground-muted)] mb-6">
        {c.phone as string} · {c.email as string}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Автомобили</p>
          <p className="text-2xl font-bold">{vehicles.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Визиты</p>
          <p className="text-2xl font-bold">{repairOrders.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Баллы</p>
          <p className="text-2xl font-bold">{loyalty?.points ?? 0}</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">Автомобили</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {vehicles.map((v) => (
          <div key={v.id as string} className="card">
            <p className="font-medium">
              {v.model as string}, {v.year as number}
            </p>
            {v.vin ? (
              <p className="text-xs text-[var(--foreground-muted)] font-mono">
                VIN: {v.vin as string}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-3">История заказ-нарядов</h2>
      <div className="space-y-3">
        {repairOrders.map((ro) => {
          const vehicle = ro.vehicle as { model: string };
          return (
            <div key={ro.id as string} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{formatDate(ro.dateTime as Date)}</p>
                  <p className="text-sm text-[var(--foreground-muted)]">{vehicle.model}</p>
                </div>
                <span className={`badge text-xs status-${(ro.status as string).toLowerCase()}`}>
                  {REPAIR_ORDER_STATUS_LABELS[ro.status as string] ?? ro.status}
                </span>
              </div>
              {(ro.total as number) > 0 && (
                <p className="text-sm mt-2">
                  Стоимость: {formatPrice(ro.total as number)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
