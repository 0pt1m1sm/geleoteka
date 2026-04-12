export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export default async function FoundersPage() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }

  const founders = await db.founder.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }],
    include: {
      contributions: {
        select: { amount: true, isPaid: true },
      },
    },
  });

  const activeShare = founders
    .filter((f: Record<string, unknown>) => f.isActive as boolean)
    .reduce((sum: number, f: Record<string, unknown>) => sum + (f.sharePercent as number), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-display text-2xl font-bold">Учредители</h1>
        <Link href="/admin/founders/new" className="btn btn-primary text-sm">
          + Добавить
        </Link>
      </div>

      {activeShare !== 100 && (
        <div className="card mb-6 bg-[var(--color-warning-bg)] border-[var(--color-warning)]/40">
          <p className="text-sm text-[var(--color-warning)]">
            ⚠️ Сумма долей активных учредителей: {activeShare}% (должно быть 100%)
          </p>
        </div>
      )}

      {founders.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Учредителей пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {founders.map((f: Record<string, unknown>) => {
            const contributions = f.contributions as Array<{ amount: number; isPaid: boolean }>;
            const totalOwed = contributions.reduce((sum, c) => sum + c.amount, 0);
            const totalPaid = contributions.filter((c) => c.isPaid).reduce((sum, c) => sum + c.amount, 0);
            const outstanding = totalOwed - totalPaid;

            return (
              <Link
                key={f.id as string}
                href={`/admin/founders/${f.id as string}`}
                className="card card-hover flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium">{f.name as string}</p>
                    {!(f.isActive as boolean) && (
                      <span className="badge text-[10px] bg-[var(--background-secondary)] text-[var(--foreground-muted)]">
                        Неактивен
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Доля: {f.sharePercent as number}%
                    {f.email ? ` · ${f.email}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Внесено: <span className="text-[var(--color-success)]">{formatPrice(totalPaid)}</span>
                  </p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Долг: <span className={outstanding > 0 ? "text-[var(--color-warning)]" : "text-[var(--foreground)]"}>{formatPrice(outstanding)}</span>
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
