export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";

export default async function CustomersPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const customers = await db.user.findMany({
    where: { isCustomer: true, permissionRole: { in: ["CLIENT", "NONE"] } },
    include: {
      vehicles: {
        where: { ownershipType: "CUSTOMER" },
        select: { model: true },
      },
      loyaltyAccount: { select: { points: true, tier: true } },
      _count: { select: { repairOrders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader eyebrow="CRM" title="Клиенты" />

      <div className="space-y-3">
        {customers.map((c: Record<string, unknown>) => {
          const vehicles = c.vehicles as Array<{ model: string }>;
          const loyalty = c.loyaltyAccount as { points: number; tier: string } | null;
          const count = c._count as { repairOrders: number };
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
                {vehicles.length > 0 && (
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">
                    {vehicles.map((v) => v.model).join(", ")}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium">{count.repairOrders} визитов</p>
                {loyalty && (
                  <span
                    className={`badge text-[10px] badge-${
                      loyalty.tier === "AMG_CLUB"
                        ? "amg"
                        : loyalty.tier.toLowerCase()
                    }`}
                  >
                    {loyalty.points} б.
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
