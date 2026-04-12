export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";
import { SupplierOrderStatusChanger } from "@/components/admin/SupplierOrderStatusChanger";
import { ContributionPaidToggle } from "@/components/admin/ContributionPaidToggle";

interface Props {
  params: Promise<{ id: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  PART: "Запчасть",
  CUSTOM: "Другое",
  FEE: "Комиссия",
  SERVICE: "Услуга",
};

export default async function SupplierOrderDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }

  const { id } = await params;
  const order = await db.supplierOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: true,
      contributions: {
        include: { founder: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) notFound();

  const totalContributions = order.contributions.reduce((sum, c) => sum + c.amount, 0);
  const totalPaid = order.contributions
    .filter((c) => c.isPaid)
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/suppliers/orders" className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
          ← К списку заказов
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-display text-2xl font-bold">
              Заказ {order.orderNumber ? `#${order.orderNumber}` : ""}
            </h1>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              <Link href={`/admin/suppliers/${order.supplier.id}`} className="hover:text-[var(--color-accent)]">
                {order.supplier.name}
              </Link>
              {" · "}
              {formatDate(order.orderDate)}
            </p>
          </div>
          <SupplierOrderStatusChanger orderId={order.id} currentStatus={order.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 cols — items + financials */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Позиции ({order.items.length})</h2>
            <div className="card">
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border)] last:border-0 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase text-[var(--foreground-muted)] bg-[var(--background-secondary)] px-1.5 py-0.5 rounded">
                          {TYPE_LABELS[item.type] ?? item.type}
                        </span>
                        <p className="text-sm font-medium truncate">{item.description}</p>
                      </div>
                      <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                        {item.quantity} × {formatPrice(item.unitCost)}
                      </p>
                    </div>
                    <p className="font-medium shrink-0">{formatPrice(item.totalCost)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Financial summary */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Финансы</h2>
            <div className="card space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--foreground-muted)]">Стоимость позиций</span>
                <span>{formatPrice(order.itemsCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--foreground-muted)]">Доставка</span>
                <span>{formatPrice(order.shippingCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--foreground-muted)]">Таможня</span>
                <span>{formatPrice(order.customsCost)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border)] font-semibold">
                <span>Итого</span>
                <span className="text-[var(--color-accent)] text-lg">{formatPrice(order.totalCost)}</span>
              </div>
              {order.sellingPrice > 0 && (
                <>
                  <div className="flex justify-between text-sm pt-2 border-t border-[var(--border)]">
                    <span className="text-[var(--foreground-muted)]">Ожидаемая выручка</span>
                    <span>{formatPrice(order.sellingPrice)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--foreground-muted)]">Прибыль</span>
                    <span className={order.estimatedProfit >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}>
                      {formatPrice(order.estimatedProfit)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Logistics */}
          {(order.trackingNumber || order.estimatedArrival || order.notes) && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Логистика</h2>
              <div className="card space-y-2 text-sm">
                {order.trackingNumber ? (
                  <div className="flex justify-between">
                    <span className="text-[var(--foreground-muted)]">Трекинг-номер</span>
                    <span className="font-mono">{order.trackingNumber}</span>
                  </div>
                ) : null}
                {order.estimatedArrival ? (
                  <div className="flex justify-between">
                    <span className="text-[var(--foreground-muted)]">Ожидаемая дата прибытия</span>
                    <span>{formatDate(order.estimatedArrival)}</span>
                  </div>
                ) : null}
                {order.receivedAt ? (
                  <div className="flex justify-between">
                    <span className="text-[var(--foreground-muted)]">Получен</span>
                    <span>{formatDate(order.receivedAt)}</span>
                  </div>
                ) : null}
                {order.notes ? (
                  <div className="pt-2 border-t border-[var(--border)]">
                    <p className="text-xs text-[var(--foreground-muted)] mb-1">Заметки</p>
                    <p className="italic">{order.notes}</p>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Right — founder contributions */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Вклады учредителей</h2>
          <div className="card space-y-3">
            {order.contributions.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">Нет активных учредителей</p>
            ) : (
              order.contributions.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border)] last:border-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.founder.name}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {c.sharePercent}% · {formatPrice(c.amount)}
                    </p>
                  </div>
                  <ContributionPaidToggle contributionId={c.id} isPaid={c.isPaid} />
                </div>
              ))
            )}

            <div className="pt-3 border-t border-[var(--border)] space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Всего</span>
                <span className="font-medium">{formatPrice(totalContributions)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Внесено</span>
                <span className="text-[var(--color-success)] font-medium">{formatPrice(totalPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Осталось</span>
                <span className="text-[var(--color-warning)] font-medium">
                  {formatPrice(totalContributions - totalPaid)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
