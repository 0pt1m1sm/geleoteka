"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupplierOrder } from "@/app/actions/supplier-orders";
import { Alert, Button, Card, Textarea } from "@/components/ui";
import { SupplierPicker } from "./supplier-order-form/SupplierPicker";
import { OrderLineItems } from "./supplier-order-form/OrderLineItems";
import { OrderTotals } from "./supplier-order-form/OrderTotals";
import type {
  ItemRow,
  PartOption,
  SupplierOption,
} from "./supplier-order-form/types";

export function SupplierOrderForm({
  suppliers,
  parts,
}: {
  suppliers: SupplierOption[];
  parts: PartOption[];
}): React.ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [items, setItems] = useState<ItemRow[]>([
    { type: "PART", partId: null, description: "", quantity: 1, unitCost: 0 },
  ]);
  const [shippingCost, setShippingCost] = useState(0);
  const [customsCost, setCustomsCost] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [estimatedArrival, setEstimatedArrival] = useState("");
  const [notes, setNotes] = useState("");

  const itemsCost = items.reduce((sum, i) => sum + i.unitCost * i.quantity, 0);
  const totalCost = itemsCost + shippingCost + customsCost;
  const estimatedProfit = sellingPrice - totalCost;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (!supplierId) {
      setError("Выберите поставщика");
      setSubmitting(false);
      return;
    }

    if (items.length === 0 || items.some((i) => !i.description || i.unitCost <= 0)) {
      setError("Все позиции должны иметь описание и стоимость > 0");
      setSubmitting(false);
      return;
    }

    const result = await createSupplierOrder({
      supplierId,
      orderNumber: orderNumber || undefined,
      orderDate,
      items: items.map((i) => ({
        type: i.type,
        partId: i.type === "PART" ? i.partId : null,
        description: i.description,
        quantity: i.quantity,
        unitCost: i.unitCost,
      })),
      shippingCost,
      customsCost,
      sellingPrice,
      trackingNumber: trackingNumber || undefined,
      estimatedArrival: estimatedArrival || undefined,
      notes: notes || undefined,
    });

    if (result.success && result.orderId) {
      router.push(`/admin/suppliers/orders/${result.orderId}`);
    } else {
      setError(result.error || "Ошибка при создании заказа");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}

      <SupplierPicker
        suppliers={suppliers}
        supplierId={supplierId}
        setSupplierId={setSupplierId}
        orderNumber={orderNumber}
        setOrderNumber={setOrderNumber}
        orderDate={orderDate}
        setOrderDate={setOrderDate}
        estimatedArrival={estimatedArrival}
        setEstimatedArrival={setEstimatedArrival}
        trackingNumber={trackingNumber}
        setTrackingNumber={setTrackingNumber}
      />

      <OrderLineItems items={items} setItems={setItems} parts={parts} />

      <OrderTotals
        shippingCost={shippingCost}
        setShippingCost={setShippingCost}
        customsCost={customsCost}
        setCustomsCost={setCustomsCost}
        sellingPrice={sellingPrice}
        setSellingPrice={setSellingPrice}
        itemsCost={itemsCost}
        totalCost={totalCost}
        estimatedProfit={estimatedProfit}
      />

      <Card>
        <Textarea
          label="Заметки"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </Card>

      <div className="flex gap-4">
        <Link href="/admin/suppliers/orders" className="btn btn-secondary">Отмена</Link>
        <div className="flex-1" />
        <Button type="submit" variant="primary" isLoading={submitting} disabled={submitting}>
          {submitting ? "Создание..." : "Создать заказ"}
        </Button>
      </div>
    </form>
  );
}
