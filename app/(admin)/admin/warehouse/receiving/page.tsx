export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { receivingQueue } from "@/lib/warehouse/receiving-queue";

const STATUS_LABELS: Record<string, string> = {
  ORDERED: "Заказ размещён",
  IN_TRANSIT: "В пути",
  CUSTOMS: "Таможня",
  PARTIALLY_RECEIVED: "Частично получен",
};

/**
 * Task-first receiving queue for the storekeeper: every open supplier order
 * with its expected-vs-received progress. Worker-safe — no purchase prices are
 * queried or rendered anywhere on this page (see receivingQueue).
 */
export default async function ReceivingQueuePage() {
  const session = await getSession();
  const role = session?.permissionRole;
  if (!session || (role !== "ADMIN" && role !== "MANAGER" && role !== "WAREHOUSE_WORKER")) {
    redirect("/login");
  }

  const rows = await receivingQueue(db, new Date());

  return (
    <div>
      <PageHeader
        eyebrow="Склад"
        title="Приёмка"
        description="Ожидаемые поставки: что едет и что нужно принять"
        backHref="/admin/warehouse"
        backLabel="Склад"
      />

      {rows.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Открытых поставок нет — всё принято.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const done = r.receivedTotal >= r.orderedTotal && r.orderedTotal > 0;
            return (
              <Link
                key={r.orderId}
                href={`/admin/warehouse/receiving/${r.orderId}`}
                className="card card-hover flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-medium">{r.supplierName}</p>
                    <span className="badge text-[10px] bg-[var(--background-secondary)] text-[var(--foreground-muted)]">
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                    {r.overdue && (
                      <span className="badge text-[10px] bg-[var(--color-error-bg)] text-[var(--color-error)]">
                        просрочено
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {r.orderNumber ? `#${r.orderNumber} · ` : ""}
                    заказан {formatDate(r.orderDate)}
                    {r.estimatedArrival ? ` · ожидается ${formatDate(r.estimatedArrival)}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={done ? "font-semibold text-[var(--color-success)]" : "font-semibold"}>
                    {r.receivedTotal} из {r.orderedTotal}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)]">принято</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
