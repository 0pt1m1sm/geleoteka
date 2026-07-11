"use client";

import { useState } from "react";
import { useProgressRouter } from "@/components/shared/NavigationProgressProvider";
import Link from "next/link";
import { createSupplierOrder, updateSupplierOrder } from "@/app/actions/supplier-orders";
import { Alert, Button, Card, Textarea } from "@/components/ui";
import { SupplierPicker } from "./supplier-order-form/SupplierPicker";
import { OrderLineItems } from "./supplier-order-form/OrderLineItems";
import { OrderTotals, type LandedCostState } from "./supplier-order-form/OrderTotals";
import {
  orderWeightGrams,
  computeShippingRub,
  computeCustomsRub,
  DEFAULT_CUSTOMS_PERCENT_BPS,
} from "@/lib/suppliers/landed-cost";
import type {
  ItemRow,
  PartOption,
  SupplierOption,
} from "./supplier-order-form/types";

/** Everything the edit page pre-fills from the persisted order. */
export interface OrderFormInitialValues {
  supplierId: string;
  orderNumber: string;
  orderDate: string; // yyyy-mm-dd
  items: ItemRow[];
  landedCost: LandedCostState;
  trackingNumber: string;
  estimatedArrival: string; // yyyy-mm-dd or ""
  notes: string;
}

export function SupplierOrderForm({
  suppliers,
  parts,
  initialItems,
  mode = "create",
  orderId,
  initialValues,
}: {
  suppliers: SupplierOption[];
  parts: PartOption[];
  /** Pre-filled lines (e.g. from the replenishment report). Defaults to one empty PART row. */
  initialItems?: ItemRow[];
  /** "edit" reuses the form for a DRAFT order — submit routes to updateSupplierOrder. */
  mode?: "create" | "edit";
  /** Required when mode === "edit". */
  orderId?: string;
  /** Persisted values for edit mode. */
  initialValues?: OrderFormInitialValues;
}): React.ReactElement {
  const nav = useProgressRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const [supplierId, setSupplierId] = useState(initialValues?.supplierId ?? suppliers[0]?.id ?? "");
  const [orderNumber, setOrderNumber] = useState(initialValues?.orderNumber ?? "");
  const [orderDate, setOrderDate] = useState(initialValues?.orderDate ?? today);
  const [items, setItems] = useState<ItemRow[]>(
    initialValues?.items && initialValues.items.length > 0
      ? initialValues.items
      : initialItems && initialItems.length > 0
        ? initialItems
        : [{ type: "PART", partId: null, description: "", quantity: 1, unitCost: 0 }],
  );
  const [landedCost, setLandedCost] = useState<LandedCostState>(
    initialValues?.landedCost ?? {
      shippingRateUsdCents: 0,
      usdRateKopecks: 0,
      customsMode: "PERCENT_CIF",
      customsPercentBps: DEFAULT_CUSTOMS_PERCENT_BPS,
      cargoRateUsdCents: 0,
      manualWeightOverrideGrams: null,
    },
  );
  const [trackingNumber, setTrackingNumber] = useState(initialValues?.trackingNumber ?? "");
  const [estimatedArrival, setEstimatedArrival] = useState(initialValues?.estimatedArrival ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");

  const itemsCost = items.reduce((sum, i) => sum + i.unitCost * i.quantity, 0);

  // Auto weight from catalog: a PART line carries its part's weight; other line
  // types (CUSTOM/FEE/SERVICE, and not-yet-created NEW_PART) contribute 0.
  const partWeightById = new Map(parts.map((p) => [p.id, p.weightGrams]));
  const autoWeightGrams = orderWeightGrams(
    items.map((i) => ({
      weightGrams: i.type === "PART" && i.partId ? (partWeightById.get(i.partId) ?? null) : null,
      quantity: i.quantity,
    })),
  );
  const effectiveWeightGrams = landedCost.manualWeightOverrideGrams ?? autoWeightGrams;
  const shippingCost = computeShippingRub({
    weightGrams: effectiveWeightGrams,
    shippingRateUsdCents: landedCost.shippingRateUsdCents,
    usdRateKopecks: landedCost.usdRateKopecks,
  });
  const customsCost =
    landedCost.customsMode === "PERCENT_CIF"
      ? computeCustomsRub({ mode: "PERCENT_CIF", itemsCostRub: itemsCost, shippingRub: shippingCost, customsPercentBps: landedCost.customsPercentBps })
      : computeCustomsRub({ mode: "CARGO_PER_KG", weightGrams: effectiveWeightGrams, cargoRateUsdCents: landedCost.cargoRateUsdCents, usdRateKopecks: landedCost.usdRateKopecks });
  const totalCost = itemsCost + shippingCost + customsCost;

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>): Promise<void> {
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

    if (items.some((i) => i.type === "NEW_PART" && !i.article?.trim())) {
      setError("Укажите артикул для нового товара");
      setSubmitting(false);
      return;
    }

    const payload = {
      supplierId,
      orderNumber: orderNumber || undefined,
      orderDate,
      items: items.map((i) => ({
        type: i.type,
        partId: i.type === "PART" ? i.partId : null,
        description: i.description,
        article: i.type === "NEW_PART" ? i.article?.trim() : undefined,
        quantity: i.quantity,
        unitCost: i.unitCost,
      })),
      manualWeightOverrideGrams: landedCost.manualWeightOverrideGrams,
      shippingRateUsdCents: landedCost.shippingRateUsdCents,
      usdRateKopecks: landedCost.usdRateKopecks,
      customsMode: landedCost.customsMode,
      customsPercentBps: landedCost.customsPercentBps,
      cargoRateUsdCents: landedCost.cargoRateUsdCents,
      trackingNumber: trackingNumber || undefined,
      estimatedArrival: estimatedArrival || undefined,
      notes: notes || undefined,
    };

    const result =
      mode === "edit" && orderId
        ? await updateSupplierOrder(orderId, payload)
        : await createSupplierOrder(payload);

    if (result.success && result.orderId) {
      nav.push(`/admin/suppliers/orders/${result.orderId}`);
    } else {
      setError(result.error || (mode === "edit" ? "Ошибка при сохранении заказа" : "Ошибка при создании заказа"));
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
        state={landedCost}
        onChange={(patch) => setLandedCost((prev) => ({ ...prev, ...patch }))}
        preview={{ itemsCost, autoWeightGrams, effectiveWeightGrams, shippingCost, customsCost, totalCost }}
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
        <Link
          href={mode === "edit" && orderId ? `/admin/suppliers/orders/${orderId}` : "/admin/suppliers/orders"}
          className="btn btn-secondary"
        >
          Отмена
        </Link>
        <div className="flex-1" />
        <Button type="submit" variant="primary" isLoading={submitting} disabled={submitting}>
          {submitting
            ? mode === "edit"
              ? "Сохранение..."
              : "Создание..."
            : mode === "edit"
              ? "Сохранить изменения"
              : "Создать заказ"}
        </Button>
      </div>
    </form>
  );
}
