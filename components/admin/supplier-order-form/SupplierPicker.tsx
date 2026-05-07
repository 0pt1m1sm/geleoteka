"use client";

import { Card, CardTitle, Input, Select } from "@/components/ui";
import type { SupplierOption } from "./types";

interface SupplierPickerProps {
  suppliers: SupplierOption[];
  supplierId: string;
  setSupplierId: (v: string) => void;
  orderNumber: string;
  setOrderNumber: (v: string) => void;
  orderDate: string;
  setOrderDate: (v: string) => void;
  estimatedArrival: string;
  setEstimatedArrival: (v: string) => void;
  trackingNumber: string;
  setTrackingNumber: (v: string) => void;
}

export function SupplierPicker({
  suppliers,
  supplierId,
  setSupplierId,
  orderNumber,
  setOrderNumber,
  orderDate,
  setOrderDate,
  estimatedArrival,
  setEstimatedArrival,
  trackingNumber,
  setTrackingNumber,
}: SupplierPickerProps): React.ReactElement {
  return (
    <Card className="space-y-4">
      <CardTitle>Основная информация</CardTitle>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Поставщик *"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          required
        >
          <option value="">Выберите...</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
        <Input
          label="Номер заказа (у поставщика)"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Дата заказа *"
          type="date"
          value={orderDate}
          onChange={(e) => setOrderDate(e.target.value)}
          required
        />
        <Input
          label="Ожидаемая дата прибытия"
          type="date"
          value={estimatedArrival}
          onChange={(e) => setEstimatedArrival(e.target.value)}
        />
      </div>

      <Input
        label="Трекинг-номер"
        value={trackingNumber}
        onChange={(e) => setTrackingNumber(e.target.value)}
        placeholder="EB123456789RU"
      />
    </Card>
  );
}
