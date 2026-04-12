export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export default async function SuppliersPage() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }

  const suppliers = await db.supplier.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      orders: {
        select: { totalCost: true },
      },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-display text-2xl font-bold">Поставщики</h1>
        <div className="flex gap-2">
          <Link href="/admin/suppliers/orders" className="btn btn-secondary text-sm">
            Все заказы
          </Link>
          <Link href="/admin/suppliers/new" className="btn btn-primary text-sm">
            + Добавить
          </Link>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Поставщиков пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map((s: Record<string, unknown>) => {
            const orders = s.orders as Array<{ totalCost: number }>;
            const totalSpent = orders.reduce((sum, o) => sum + o.totalCost, 0);

            return (
              <Link
                key={s.id as string}
                href={`/admin/suppliers/${s.id as string}`}
                className="card card-hover flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium">{s.name as string}</p>
                    {!(s.isActive as boolean) && (
                      <span className="badge text-[10px] bg-[var(--background-secondary)] text-[var(--foreground-muted)]">
                        Неактивен
                      </span>
                    )}
                    {s.country ? (
                      <span className="text-xs text-[var(--foreground-muted)]">· {s.country as string}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {orders.length} заказов
                    {s.contactName ? ` · ${s.contactName as string}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-[var(--foreground-muted)]">Всего потрачено</p>
                  <p className="font-bold text-[var(--color-accent)]">{formatPrice(totalSpent)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
