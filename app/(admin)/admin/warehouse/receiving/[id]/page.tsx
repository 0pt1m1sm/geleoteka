export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { SupplierOrderReceiving, type ReceivingLine } from "@/components/admin/SupplierOrderReceiving";

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

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Worker-safe receiving view of one supplier order: PART lines only, ZERO
 * purchase prices in the query — nothing confidential can reach the RSC
 * payload (Goal Verification Truth 1). Admin financials live on
 * /admin/suppliers/orders/[id], which stays manager-only.
 */
export default async function ReceivingOrderPage({ params }: Props) {
  const session = await getSession();
  const role = session?.permissionRole;
  if (!session || (role !== "ADMIN" && role !== "MANAGER" && role !== "WAREHOUSE_WORKER")) {
    redirect("/login");
  }

  const { id } = await params;
  const order = (await db.supplierOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      orderNumber: true,
      orderDate: true,
      estimatedArrival: true,
      supplier: { select: { name: true } },
      items: {
        where: { type: "PART" },
        select: {
          id: true,
          type: true,
          partId: true,
          description: true,
          quantity: true,
          receivedQuantity: true,
          part: { select: { article: true, stockItems: { select: { barcode: true } } } },
        },
      },
    },
  })) as {
    id: string;
    status: string;
    orderNumber: string | null;
    orderDate: Date;
    estimatedArrival: Date | null;
    supplier: { name: string | null } | null;
    items: Array<{
      id: string;
      type: string;
      partId: string | null;
      description: string;
      quantity: number;
      receivedQuantity: number;
      part: { article: string | null; stockItems: Array<{ barcode: string | null }> } | null;
    }>;
  } | null;

  if (!order) notFound();

  // No unitCost/totalCost here — the worker payload stays price-free.
  const lines: ReceivingLine[] = order.items.map((it) => ({
    lineId: it.id,
    type: it.type,
    partId: it.partId,
    description: it.description,
    article: it.part?.article ?? null,
    barcode: it.part?.stockItems?.[0]?.barcode ?? null,
    ordered: it.quantity,
    received: it.receivedQuantity,
  }));

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/warehouse/receiving" className="back-link">
          ← К очереди приёмки
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-display text-2xl font-bold">
              Приёмка {order.orderNumber ? `#${order.orderNumber}` : ""}
            </h1>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              {order.supplier?.name ?? "—"}
              {" · заказан "}
              {formatDate(order.orderDate)}
              {order.estimatedArrival ? ` · ожидается ${formatDate(order.estimatedArrival)}` : ""}
            </p>
          </div>
          <span className="badge bg-[var(--background-secondary)] text-[var(--foreground-muted)] shrink-0">
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>
      </div>

      <div className="max-w-3xl">
        <SupplierOrderReceiving orderId={order.id} status={order.status} lines={lines} showFinancials={false} />
      </div>
    </div>
  );
}
