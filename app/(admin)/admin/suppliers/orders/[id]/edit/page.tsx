export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canFullyEditOrder } from "@/lib/suppliers/order-lifecycle";
import { SupplierOrderForm, type OrderFormInitialValues } from "@/components/admin/SupplierOrderForm";
import type { ItemRow } from "@/components/admin/supplier-order-form/types";
import { DEFAULT_CUSTOMS_PERCENT_BPS } from "@/lib/suppliers/landed-cost";

interface Props {
  params: Promise<{ id: string }>;
}

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().split("T")[0] : "";
}

/** Full edit of a DRAFT supplier order — reuses the create form with persisted
 *  values. Non-DRAFT orders redirect back to the detail page (meta-only edit
 *  lives there). */
export default async function EditSupplierOrderPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const { id } = await params;
  const order = (await db.supplierOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      userId: true,
      orderNumber: true,
      orderDate: true,
      manualWeightOverrideGrams: true,
      shippingRateUsdCents: true,
      usdRateKopecks: true,
      customsMode: true,
      customsPercentBps: true,
      cargoRateUsdCents: true,
      trackingNumber: true,
      estimatedArrival: true,
      notes: true,
      items: {
        select: { type: true, partId: true, description: true, quantity: true, unitCost: true },
      },
    },
  })) as {
    id: string;
    status: string;
    userId: string;
    orderNumber: string | null;
    orderDate: Date;
    manualWeightOverrideGrams: number | null;
    shippingRateUsdCents: number | null;
    usdRateKopecks: number | null;
    customsMode: "PERCENT_CIF" | "CARGO_PER_KG";
    customsPercentBps: number | null;
    cargoRateUsdCents: number | null;
    trackingNumber: string | null;
    estimatedArrival: Date | null;
    notes: string | null;
    items: Array<{ type: string; partId: string | null; description: string; quantity: number; unitCost: number }>;
  } | null;

  if (!order) notFound();
  if (!canFullyEditOrder(order.status)) redirect(`/admin/suppliers/orders/${order.id}`);

  const linePartIds = order.items.map((i) => i.partId).filter((x): x is string => Boolean(x));
  const [suppliers, parts] = await Promise.all([
    db.user.findMany({
      where: { isSupplier: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Active catalog + any (possibly draft/inactive) part already on this order,
    // so existing lines keep resolving in the picker.
    db.part.findMany({
      where: { OR: [{ isActive: true }, { id: { in: linePartIds } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, article: true, price: true, weightGrams: true },
    }),
  ]);

  const initialValues: OrderFormInitialValues = {
    supplierId: order.userId,
    orderNumber: order.orderNumber ?? "",
    orderDate: toDateInput(order.orderDate),
    items: order.items.map(
      (i): ItemRow => ({
        type: i.type as ItemRow["type"],
        partId: i.partId,
        description: i.description,
        quantity: i.quantity,
        unitCost: i.unitCost,
      }),
    ),
    landedCost: {
      shippingRateUsdCents: order.shippingRateUsdCents ?? 0,
      usdRateKopecks: order.usdRateKopecks ?? 0,
      customsMode: order.customsMode,
      customsPercentBps: order.customsPercentBps ?? DEFAULT_CUSTOMS_PERCENT_BPS,
      cargoRateUsdCents: order.cargoRateUsdCents ?? 0,
      manualWeightOverrideGrams: order.manualWeightOverrideGrams,
    },
    trackingNumber: order.trackingNumber ?? "",
    estimatedArrival: toDateInput(order.estimatedArrival),
    notes: order.notes ?? "",
  };

  return (
    <div className="max-w-4xl">
      <Link
        href={`/admin/suppliers/orders/${order.id}`}
        className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] inline-block mb-2"
      >
        ← К заказу
      </Link>
      <h1 className="text-display text-2xl font-bold mb-6">
        Редактирование заказа {order.orderNumber ? `#${order.orderNumber}` : ""}
      </h1>
      <SupplierOrderForm
        suppliers={suppliers.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))}
        parts={parts.map((p: { id: string; name: string; article: string; price: number; weightGrams: number | null }) => ({
          id: p.id,
          name: p.name,
          article: p.article,
          price: p.price,
          weightGrams: p.weightGrams ?? null,
        }))}
        mode="edit"
        orderId={order.id}
        initialValues={initialValues}
      />
    </div>
  );
}
