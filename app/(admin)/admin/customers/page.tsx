export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CustomersPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const customers = await db.user.findMany({
    where: { role: "CLIENT" },
    include: {
      cars: { select: { model: true } },
      loyaltyAccount: { select: { points: true, tier: true } },
      _count: { select: { appointments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">Клиенты</h1>

      <div className="space-y-3">
        {customers.map((c: Record<string, unknown>) => {
          const cars = c.cars as Array<{ model: string }>;
          const loyalty = c.loyaltyAccount as Record<string, unknown> | null;
          const count = c._count as { appointments: number };
          return (
            <Link
              key={c.id as string}
              href={`/admin/customers/${c.id as string}`}
              className="card card-hover flex items-center justify-between gap-4"
            >
              <div>
                <p className="font-medium">{c.name as string}</p>
                <p className="text-sm text-[var(--foreground-muted)]">
                  {c.phone as string} · {c.email as string}
                </p>
                {cars.length > 0 && (
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">
                    {cars.map((car) => car.model).join(", ")}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium">{count.appointments} визитов</p>
                {loyalty && (
                  <span
                    className={`badge text-[10px] badge-${(loyalty.tier as string) === "AMG_CLUB" ? "amg" : (loyalty.tier as string).toLowerCase()}`}
                  >
                    {loyalty.points as number} б.
                  </span>
                )}
              </div>
            </Link>
          );
        })}

        {customers.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-[var(--foreground-muted)]">Клиентов пока нет</p>
          </div>
        )}
      </div>
    </div>
  );
}
