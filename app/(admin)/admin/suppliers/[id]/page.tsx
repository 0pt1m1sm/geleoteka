export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";
import { SupplierEditForm } from "@/components/admin/SupplierEditForm";

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  ORDERED: "Заказ размещён",
  IN_TRANSIT: "В пути",
  CUSTOMS: "Таможня",
  RECEIVED: "Получен",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

export default async function SupplierDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const { id } = await params;
  const supplier = await db.user.findFirst({
    where: { id, isSupplier: true },
    include: {
      supplierProfile: true,
      supplierOrders: {
        orderBy: { orderDate: "desc" },
        take: 20,
      },
    },
  });

  if (!supplier) notFound();

  const s = supplier as Record<string, unknown>;
  const profile = s.supplierProfile as {
    contactName: string | null;
    country: string | null;
    notes: string | null;
    isActive: boolean;
  } | null;
  const orders = s.supplierOrders as Array<Record<string, unknown>>;

  const serialized = {
    id: s.id as string,
    name: s.name as string,
    contactName: profile?.contactName ?? "",
    email: (s.email as string) ?? "",
    phone: (s.phone as string) ?? "",
    country: profile?.country ?? "",
    notes: profile?.notes ?? "",
    isActive: profile?.isActive ?? true,
  };

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">{s.name as string}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-semibold mb-3">Данные поставщика</h2>
          <SupplierEditForm supplier={serialized} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">История заказов</h2>
            <Link
              href={`/admin/suppliers/orders/new?supplierId=${s.id as string}`}
              className="btn btn-primary text-xs"
            >
              + Новый заказ
            </Link>
          </div>

          {orders.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-[var(--foreground-muted)] text-sm">Заказов пока нет</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((o) => (
                <Link
                  key={o.id as string}
                  href={`/admin/suppliers/orders/${o.id as string}`}
                  className="card card-hover flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {o.orderNumber
                        ? `#${o.orderNumber as string}`
                        : `Заказ от ${formatDate(o.orderDate as Date)}`}
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {formatDate(o.orderDate as Date)} ·{" "}
                      {STATUS_LABELS[o.status as string] ?? (o.status as string)}
                    </p>
                  </div>
                  <p className="font-bold text-[var(--color-accent)] text-sm shrink-0">
                    {formatPrice(o.totalCost as number)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
