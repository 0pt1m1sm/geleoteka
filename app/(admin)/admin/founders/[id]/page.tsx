export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";
import { FounderEditForm } from "@/components/admin/FounderEditForm";

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

export default async function FounderDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }

  const { id } = await params;
  const founder = await db.founder.findUnique({
    where: { id },
    include: {
      contributions: {
        include: {
          order: {
            include: { supplier: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!founder) notFound();

  const f = founder as Record<string, unknown>;
  const contributions = f.contributions as Array<Record<string, unknown>>;

  const totalOwed = contributions.reduce((sum, c) => sum + (c.amount as number), 0);
  const totalPaid = contributions
    .filter((c) => c.isPaid as boolean)
    .reduce((sum, c) => sum + (c.amount as number), 0);
  const outstanding = totalOwed - totalPaid;

  const serialized = {
    id: f.id as string,
    name: f.name as string,
    email: (f.email as string) ?? "",
    phone: (f.phone as string) ?? "",
    sharePercent: f.sharePercent as number,
    sortOrder: f.sortOrder as number,
    isActive: f.isActive as boolean,
  };

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">
        {f.name as string}
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Всего внесено</p>
          <p className="text-2xl font-bold text-[var(--color-success)]">{formatPrice(totalPaid)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Текущий долг</p>
          <p className={`text-2xl font-bold ${outstanding > 0 ? "text-[var(--color-warning)]" : "text-[var(--foreground)]"}`}>
            {formatPrice(outstanding)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)]">Всего участие</p>
          <p className="text-2xl font-bold">{formatPrice(totalOwed)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Edit form */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Данные</h2>
          <FounderEditForm founder={serialized} />
        </div>

        {/* Contributions history */}
        <div>
          <h2 className="text-lg font-semibold mb-3">История вкладов</h2>
          {contributions.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-[var(--foreground-muted)] text-sm">Вкладов пока нет</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contributions.map((c) => {
                const order = c.order as Record<string, unknown>;
                const supplier = order.supplier as Record<string, string>;
                return (
                  <Link
                    key={c.id as string}
                    href={`/admin/suppliers/orders/${order.id as string}`}
                    className="card card-hover flex items-center justify-between gap-4 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{supplier.name}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        {formatDate(c.createdAt as Date)} · {STATUS_LABELS[order.status as string] ?? (order.status as string)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-[var(--color-accent)]">{formatPrice(c.amount as number)}</p>
                      <span className={`badge text-[10px] ${c.isPaid as boolean ? "bg-[var(--color-success-bg)] text-[var(--color-success)]" : "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"}`}>
                        {(c.isPaid as boolean) ? "Оплачено" : "К оплате"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
