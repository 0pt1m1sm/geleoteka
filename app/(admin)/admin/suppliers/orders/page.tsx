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

const PAGE_SIZE = 20;

type OrderStatus =
  | "DRAFT"
  | "ORDERED"
  | "IN_TRANSIT"
  | "CUSTOMS"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "COMPLETED"
  | "CANCELLED";
const IN_TRANSIT_STATUSES: OrderStatus[] = ["ORDERED", "IN_TRANSIT", "CUSTOMS"];

interface Props {
  searchParams: Promise<{ status?: string; supplier?: string; page?: string }>;
}

/** Merge filters into an href, dropping empties. The URL is the single source
 *  of filter state (shareable links). */
function filterHref(params: { status?: string; supplier?: string; page?: number }): string {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.supplier) q.set("supplier", params.supplier);
  if (params.page && params.page > 1) q.set("page", String(params.page));
  const qs = q.toString();
  return `/admin/suppliers/orders${qs ? `?${qs}` : ""}`;
}

export default async function SupplierOrdersListPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const sp = await searchParams;
  // Validated against the label map, so the cast to the enum union is safe.
  const status = (sp.status && STATUS_LABELS[sp.status] ? sp.status : undefined) as OrderStatus | undefined;
  const supplier = (sp.supplier ?? "").trim() || undefined;
  const requestedPage = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where = {
    ...(status ? { status } : {}),
    ...(supplier ? { userId: supplier } : {}),
  };

  // Header counters and pagination run over the FULL filtered set, never the
  // fetched page slice. With an active status filter the in-transit count is
  // derivable from `total` — no extra query.
  const [total, inTransitUnfiltered, turnoverAgg, suppliers] = await Promise.all([
    db.supplierOrder.count({ where }),
    status
      ? Promise.resolve(0)
      : db.supplierOrder.count({ where: { ...where, status: { in: IN_TRANSIT_STATUSES } } }),
    db.supplierOrder.aggregate({ where, _sum: { totalCost: true } }),
    db.user.findMany({
      where: { isSupplier: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const inTransitCount = status
    ? IN_TRANSIT_STATUSES.includes(status)
      ? (total as number)
      : 0
    : (inTransitUnfiltered as number);
  const turnover = ((turnoverAgg as { _sum: { totalCost: number | null } })._sum.totalCost ?? 0) as number;
  const totalPages = Math.max(1, Math.ceil((total as number) / PAGE_SIZE));
  // Clamp to the last page so ?page=99 stays coherent instead of rendering an
  // empty list under a "Стр. 99 из 2" pager.
  const page = Math.min(requestedPage, totalPages);

  const orders = await db.supplierOrder.findMany({
    where,
    include: {
      supplier: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { orderDate: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

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
        description={`Всего: ${total} · В пути: ${inTransitCount} · Оборот: ${formatPrice(turnover)}`}
        actions={
          <Link href="/admin/suppliers/orders/new">
            <Button size="sm" leftIcon={<Plus size={14} />}>Новый заказ</Button>
          </Link>
        }
      />

      {/* Status filter chips — plain links; the URL carries the state. */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Link
          href={filterHref({ supplier })}
          className={`badge text-xs ${!status ? "bg-[var(--color-accent)] text-black" : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]"}`}
        >
          Все
        </Link>
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <Link
            key={value}
            href={filterHref({ status: value === status ? undefined : value, supplier })}
            className={`badge text-xs ${value === status ? "bg-[var(--color-accent)] text-black" : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Supplier filter — plain GET form, server-rendered. */}
      <form method="GET" action="/admin/suppliers/orders" className="flex flex-wrap items-center gap-2 mb-6">
        {status && <input type="hidden" name="status" value={status} />}
        <select name="supplier" defaultValue={supplier ?? ""} className="input text-sm w-auto" aria-label="Фильтр по поставщику">
          <option value="">Все поставщики</option>
          {suppliers.map((s: { id: string; name: string }) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary btn-sm">
          Применить
        </button>
        {(status || supplier) && (
          <Link href="/admin/suppliers/orders" className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
            Сбросить фильтры
          </Link>
        )}
      </form>

      {orders.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">
            {status || supplier ? "По выбранным фильтрам заказов нет" : "Заказов пока нет"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o: Record<string, unknown>) => {
            const supplierRow = o.supplier as Record<string, string>;
            const itemCount = (o._count as { items: number }).items;
            return (
              <Link
                key={o.id as string}
                href={`/admin/suppliers/orders/${o.id as string}`}
                className="card card-hover flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium">{supplierRow.name}</p>
                    <span className={`badge text-[10px] ${STATUS_COLORS[o.status as string]}`}>
                      {STATUS_LABELS[o.status as string] ?? (o.status as string)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {o.orderNumber ? `#${o.orderNumber as string} · ` : ""}
                    {formatDate(o.orderDate as Date)} · {itemCount} позиций
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

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={filterHref({ status, supplier, page: page - 1 })} className="btn btn-secondary btn-sm">
              ← Назад
            </Link>
          ) : (
            <span className="btn btn-secondary btn-sm opacity-40 pointer-events-none">← Назад</span>
          )}
          <span className="text-[var(--foreground-muted)]">
            Стр. {page} из {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={filterHref({ status, supplier, page: page + 1 })} className="btn btn-secondary btn-sm">
              Вперёд →
            </Link>
          ) : (
            <span className="btn btn-secondary btn-sm opacity-40 pointer-events-none">Вперёд →</span>
          )}
        </div>
      )}
    </div>
  );
}
