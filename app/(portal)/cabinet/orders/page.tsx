export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ожидает",
  CONFIRMED: "Подтверждён",
  SHIPPED: "Отправлен",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const orders = await db.partOrder.findMany({
    where: { userId: session.id },
    include: {
      items: {
        include: { part: { select: { name: true, article: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">Заказы запчастей</h1>

      {orders.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">Заказов пока нет</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order: Record<string, unknown>) => {
            const items = order.items as Array<Record<string, unknown>>;
            return (
              <div key={order.id as string} className="card">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-medium">Заказ от {formatDate(order.createdAt as Date)}</p>
                    <p className="text-xs text-[var(--foreground-muted)] font-mono">
                      #{(order.id as string).slice(0, 8)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[var(--color-accent)]">{formatPrice(order.total as number)}</p>
                    <span className="badge text-[10px] bg-[var(--color-info-bg)] text-[var(--color-info)]">
                      {STATUS_LABELS[order.status as string] ?? order.status}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  {items.map((item) => {
                    const part = item.part as Record<string, string>;
                    return (
                      <div key={item.id as string} className="flex justify-between text-sm text-[var(--foreground-muted)]">
                        <span>{part.name} × {item.quantity as number}</span>
                        <span>{formatPrice((item.unitPrice as number) * (item.quantity as number))}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
