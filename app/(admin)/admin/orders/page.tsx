export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";
import { OrderStatusChanger } from "@/components/admin/OrderStatusChanger";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  CONFIRMED: "bg-[var(--color-info-bg)] text-[var(--color-info)]",
  SHIPPED: "bg-[var(--color-info-bg)] text-[var(--color-info)]",
  COMPLETED: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  CANCELLED: "bg-[var(--color-error-bg)] text-[var(--color-error)]",
};

export default async function AdminOrdersPage() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }

  const orders = await db.partOrder.findMany({
    include: {
      items: {
        include: { part: { select: { name: true, article: true } } },
      },
      user: { select: { name: true, phone: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const total = orders.length;
  const pending = orders.filter(
    (o: Record<string, unknown>) => o.status === "PENDING"
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-display text-2xl font-bold">Заказы запчастей</h1>
        <div className="text-sm text-[var(--foreground-muted)]">
          Всего: {total} · Ожидают: {pending}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Заказов пока нет</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order: Record<string, unknown>) => {
            const items = order.items as Array<Record<string, unknown>>;
            const user = order.user as Record<string, string> | null;

            return (
              <div key={order.id as string} className="card">
                {/* Order header */}
                <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-[var(--border)]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">
                        {order.contactName as string}
                      </p>
                      {user ? (
                        <span className="badge badge-silver text-[10px]">
                          Зарегистрирован
                        </span>
                      ) : (
                        <span className="badge text-[10px] bg-[var(--background-secondary)] text-[var(--foreground-muted)]">
                          Гость
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {order.contactPhone as string} · {order.contactEmail as string}
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-1">
                      Заказ #{(order.id as string).slice(0, 8)} ·{" "}
                      {formatDate(order.createdAt as Date)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-bold text-[var(--color-accent)] mb-2">
                      {formatPrice(order.total as number)}
                    </p>
                    <OrderStatusChanger
                      orderId={order.id as string}
                      currentStatus={order.status as string}
                    />
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-2">
                    Позиции ({items.length})
                  </p>
                  {items.map((item) => {
                    const part = item.part as Record<string, string>;
                    return (
                      <div
                        key={item.id as string}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="truncate">{part.name}</p>
                          <p className="text-xs text-[var(--foreground-muted)] font-mono">
                            {part.article}
                          </p>
                        </div>
                        <div className="text-right shrink-0 text-xs text-[var(--foreground-muted)]">
                          {item.quantity as number} ×{" "}
                          {formatPrice(item.unitPrice as number)}
                        </div>
                        <div className="w-24 text-right font-medium">
                          {formatPrice(
                            (item.unitPrice as number) * (item.quantity as number)
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Notes */}
                {order.notes ? (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <p className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-1">
                      Комментарий
                    </p>
                    <p className="text-sm text-[var(--foreground-muted)] italic">
                      «{order.notes as string}»
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
