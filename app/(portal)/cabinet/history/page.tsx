export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { REPAIR_ORDER_STATUS_LABELS, formatDate, formatPrice } from "@/lib/utils";

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const repairOrders = await db.repairOrder.findMany({
    where: { userId: session.id },
    include: {
      vehicle: { select: { model: true } },
      jobLines: { select: { description: true }, orderBy: { sortOrder: "asc" } },
      master: { select: { name: true } },
    },
    orderBy: { dateTime: "desc" },
  });

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">
        История обслуживания
      </h1>

      {repairOrders.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Заказ-нарядов пока нет</p>
        </div>
      ) : (
        <div className="space-y-4">
          {repairOrders.map((ro: Record<string, unknown>) => {
            const vehicle = ro.vehicle as { model: string };
            const master = ro.master as { name: string } | null;
            const jobs = ro.jobLines as Array<{ description: string }>;
            const total = ro.total as number;

            return (
              <div key={ro.id as string} className="card">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-medium">
                      {vehicle.model} — {formatDate(ro.dateTime as Date)}
                    </p>
                    {master && (
                      <p className="text-sm text-[var(--foreground-muted)]">
                        Мастер: {master.name}
                      </p>
                    )}
                  </div>
                  <span
                    className={`badge text-xs status-${(ro.status as string).toLowerCase()}`}
                  >
                    {REPAIR_ORDER_STATUS_LABELS[ro.status as string] ?? ro.status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {jobs.map((j, i) => (
                    <span key={i} className="badge badge-silver text-xs">
                      {j.description}
                    </span>
                  ))}
                </div>

                {total > 0 && (
                  <div className="pt-3 border-t border-[var(--border)]">
                    <p className="text-sm">
                      Стоимость:{" "}
                      <span className="font-semibold">{formatPrice(total)}</span>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
