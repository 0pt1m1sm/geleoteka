export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice, formatDate } from "@/lib/utils";
import { SupplierOrderStatusChanger } from "@/components/admin/SupplierOrderStatusChanger";
import { SupplierOrderReceiving, type ReceivingLine } from "@/components/admin/SupplierOrderReceiving";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SupplierOrderDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const { id } = await params;
  const order = await db.supplierOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: {
        select: {
          id: true,
          type: true,
          partId: true,
          description: true,
          quantity: true,
          receivedQuantity: true,
          unitCost: true,
          totalCost: true,
          part: { select: { article: true, stockItems: { select: { barcode: true } } } },
        },
      },
    },
  });

  if (!order) notFound();

  const receivingLines: ReceivingLine[] = order.items.map(
    (it: {
      id: string;
      type: string;
      partId: string | null;
      description: string;
      quantity: number;
      receivedQuantity: number;
      unitCost: number;
      totalCost: number;
      part: { article: string | null; stockItems: Array<{ barcode: string | null }> } | null;
    }) => ({
      lineId: it.id,
      type: it.type,
      partId: it.partId,
      description: it.description,
      article: it.part?.article ?? null,
      barcode: it.part?.stockItems?.[0]?.barcode ?? null,
      ordered: it.quantity,
      received: it.receivedQuantity,
      unitCost: it.unitCost,
      totalCost: it.totalCost,
    })
  );

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/suppliers/orders" className="back-link">
          ← К списку заказов
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-display text-2xl font-bold">
              Заказ {order.orderNumber ? `#${order.orderNumber}` : ""}
            </h1>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              <Link href={`/admin/suppliers/${order.supplier.id}`} className="hover:text-[var(--color-accent)] active:opacity-70 transition-opacity">
                {order.supplier.name}
              </Link>
              {" · "}
              {formatDate(order.orderDate)}
            </p>
          </div>
          <SupplierOrderStatusChanger orderId={order.id} currentStatus={order.status} />
        </div>
      </div>

      <div className="max-w-3xl">
        <div className="space-y-6">
          {/* Items + receiving */}
          <SupplierOrderReceiving orderId={order.id} status={order.status} lines={receivingLines} />

          {/* Financial summary */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Финансы</h2>
            <div className="card space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--foreground-muted)]">Стоимость позиций</span>
                <span>{formatPrice(order.itemsCost)}</span>
              </div>
              <div className="text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--foreground-muted)]">Доставка</span>
                  <span>{formatPrice(order.shippingCost)}</span>
                </div>
                {order.shippingWeightGrams != null && order.shippingWeightGrams > 0 && order.shippingRateUsdCents != null && order.usdRateKopecks != null ? (
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {(order.shippingWeightGrams / 1000).toLocaleString("ru-RU")} кг
                    {order.manualWeightOverrideGrams != null ? " (вручную)" : ""} × ${order.shippingRateUsdCents / 100}/кг × {order.usdRateKopecks / 100} ₽/$
                  </p>
                ) : null}
              </div>
              <div className="text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--foreground-muted)]">Таможня</span>
                  <span>{formatPrice(order.customsCost)}</span>
                </div>
                {order.customsMode === "PERCENT_CIF" && order.customsPercentBps != null ? (
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{order.customsPercentBps / 100}% от CIF</p>
                ) : order.customsMode === "CARGO_PER_KG" && order.cargoRateUsdCents != null ? (
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">Карго ${order.cargoRateUsdCents / 100}/кг</p>
                ) : null}
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border)] font-semibold">
                <span>Итого</span>
                <span className="text-[var(--color-accent)] text-lg">{formatPrice(order.totalCost)}</span>
              </div>
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

      </div>
    </div>
  );
}
