"use client";

import { Card, CardTitle, Input } from "@/components/ui";
import { formatPrice } from "@/lib/utils";

interface OrderTotalsProps {
  shippingCost: number;
  setShippingCost: (v: number) => void;
  customsCost: number;
  setCustomsCost: (v: number) => void;
  itemsCost: number;
  totalCost: number;
}

export function OrderTotals({
  shippingCost,
  setShippingCost,
  customsCost,
  setCustomsCost,
  itemsCost,
  totalCost,
}: OrderTotalsProps): React.ReactElement {
  return (
    <Card className="space-y-4">
      <CardTitle>Финансы</CardTitle>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Доставка (₽)"
          type="number"
          min={0}
          value={shippingCost || ""}
          onChange={(e) => setShippingCost(parseInt(e.target.value) || 0)}
        />
        <Input
          label="Таможня (₽)"
          type="number"
          min={0}
          value={customsCost || ""}
          onChange={(e) => setCustomsCost(parseInt(e.target.value) || 0)}
        />
      </div>

      <div className="bg-[var(--background-secondary)] rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--foreground-muted)]">Стоимость позиций:</span>
          <span className="font-medium">{formatPrice(itemsCost)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--foreground-muted)]">+ Доставка:</span>
          <span className="font-medium">{formatPrice(shippingCost)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--foreground-muted)]">+ Таможня:</span>
          <span className="font-medium">{formatPrice(customsCost)}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-[var(--border)]">
          <span className="font-semibold">Итого (к разделу между учредителями):</span>
          <span className="font-bold text-[var(--color-accent)] text-base">{formatPrice(totalCost)}</span>
        </div>
      </div>
    </Card>
  );
}
