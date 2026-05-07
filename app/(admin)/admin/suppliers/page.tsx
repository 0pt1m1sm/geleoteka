export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { Button, PageHeader } from "@/components/ui";

export default async function SuppliersPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const suppliers = await db.user.findMany({
    where: { isSupplier: true },
    include: {
      supplierProfile: true,
      supplierOrders: { select: { totalCost: true } },
    },
  });

  // Sort: active first, then by name
  suppliers.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const ap = (a.supplierProfile as { isActive: boolean } | null)?.isActive ?? false;
    const bp = (b.supplierProfile as { isActive: boolean } | null)?.isActive ?? false;
    if (ap !== bp) return ap ? -1 : 1;
    return (a.name as string).localeCompare(b.name as string);
  });

  return (
    <div>
      <PageHeader
        eyebrow="Запчасти"
        title="Поставщики"
        actions={
          <div className="flex gap-2">
            <Link href="/admin/suppliers/orders">
              <Button variant="secondary" size="sm">Все заказы</Button>
            </Link>
            <Link href="/admin/suppliers/new">
              <Button size="sm" leftIcon={<Plus size={14} />}>Добавить</Button>
            </Link>
          </div>
        }
      />

      {suppliers.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Поставщиков пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map((s: Record<string, unknown>) => {
            const profile = s.supplierProfile as {
              isActive: boolean;
              country: string | null;
              contactName: string | null;
            } | null;
            const orders = s.supplierOrders as Array<{ totalCost: number }>;
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
                    {!profile?.isActive && (
                      <span className="badge text-[10px] bg-[var(--background-secondary)] text-[var(--foreground-muted)]">
                        Неактивен
                      </span>
                    )}
                    {profile?.country && (
                      <span className="text-xs text-[var(--foreground-muted)]">
                        · {profile.country}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {orders.length} заказов
                    {profile?.contactName ? ` · ${profile.contactName}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-[var(--foreground-muted)]">Всего потрачено</p>
                  <p className="font-bold text-[var(--color-accent)]">
                    {formatPrice(totalSpent)}
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
