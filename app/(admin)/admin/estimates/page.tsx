export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";

export default async function AdminEstimatesPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const estimates = await db.estimate.findMany({
    include: {
      items: true,
      appointment: {
        include: {
          user: { select: { name: true } },
          car: { select: { model: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-display text-2xl font-bold">Сметы</h1>
        <Link href="/admin/estimates/new" className="btn btn-primary text-sm">
          + Создать смету
        </Link>
      </div>

      {estimates.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Смет пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {estimates.map((e: Record<string, unknown>) => {
            const apt = e.appointment as Record<string, unknown>;
            const user = apt.user as Record<string, string>;
            const car = apt.car as Record<string, string>;
            return (
              <div key={e.id as string} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{user.name} — {car.model}</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {formatDate(e.createdAt as Date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[var(--color-accent)]">
                      {formatPrice(e.total as number)}
                    </p>
                    <span
                      className={`badge text-[10px] ${
                        e.status === "APPROVED"
                          ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                          : e.status === "REJECTED"
                            ? "bg-[var(--color-error-bg)] text-[var(--color-error)]"
                            : "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
                      }`}
                    >
                      {e.status === "APPROVED" ? "Одобрена" : e.status === "REJECTED" ? "Отклонена" : "Ожидает"}
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
