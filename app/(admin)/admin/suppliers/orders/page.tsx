export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";
import { Button, Card, PageHeader } from "@/components/ui";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  ORDERED: "Заказ размещён",
  IN_TRANSIT: "В пути",
  CUSTOMS: "Таможня",
  PARTIALLY_RECEIVED: "Частично получен",
  RECEIVED: "Получен",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
  ORDERED: "bg-[var(--color-info-bg)] text-[var(--color-info)]",
  IN_TRANSIT: "bg-[var(--color-info-bg)] text-[var(--color-info)]",
  CUSTOMS: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  PARTIALLY_RECEIVED: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  RECEIVED: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  COMPLETED: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  CANCELLED: "bg-[var(--color-error-bg)] text-[var(--color-error)]",
};

export default async function SupplierOrdersListPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const orders = await db.supplierOrder.findMany({
    include: {
      supplier: { select: { name: true } },
      items: { select: { id: true } },
    },
    orderBy: { orderDate: "desc" },
    take: 100,
  });

  const total = orders.reduce((sum: number, o: Record<string, unknown>) => sum + (o.totalCost as number), 0);
  const inTransit = orders.filter((o: Record<string, unknown>) =>
    ["ORDERED", "IN_TRANSIT", "CUSTOMS"].includes(o.status as string)
  ).length;

  return (
    <div>
      <Link
        href="/admin/suppliers"
        className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] inline-block mb-2"
      >
        ← Поставщики
      </Link>
      <PageHeader
        eyebrow="Запчасти"
        title="Заказы поставщикам"
        description={`Всего: ${orders.length} · В пути: ${inTransit} · Оборот: ${formatPrice(total)}`}
        actions={
          <Link href="/admin/suppliers/orders/new">
            <Button size="sm" leftIcon={<Plus size={14} />}>Новый заказ</Button>
          </Link>
        }
      />

      {orders.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Заказов пока нет</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o: Record<string, unknown>) => {
            const supplier = o.supplier as Record<string, string>;
            const items = o.items as Array<unknown>;
            return (
              <Link
                key={o.id as string}
                href={`/admin/suppliers/orders/${o.id as string}`}
                className="card card-hover flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium">{supplier.name}</p>
                    <span className={`badge text-[10px] ${STATUS_COLORS[o.status as string]}`}>
                      {STATUS_LABELS[o.status as string] ?? (o.status as string)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {o.orderNumber ? `#${o.orderNumber as string} · ` : ""}
                    {formatDate(o.orderDate as Date)} · {items.length} позиций
                    {o.trackingNumber ? ` · трекинг: ${o.trackingNumber as string}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-[var(--color-accent)]">{formatPrice(o.totalCost as number)}</p>
                  {(o.estimatedProfit as number) > 0 && (
                    <p className="text-xs text-[var(--color-success)]">
                      +{formatPrice(o.estimatedProfit as number)} прибыль
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
