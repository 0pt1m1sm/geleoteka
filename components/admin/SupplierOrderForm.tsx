"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupplierOrder } from "@/app/actions/supplier-orders";
import { formatPrice } from "@/lib/utils";

interface SupplierOption {
  id: string;
  name: string;
}

interface PartOption {
  id: string;
  name: string;
  article: string;
  price: number;
}

interface ItemRow {
  type: "PART" | "CUSTOM" | "FEE" | "SERVICE";
  partId: string | null;
  description: string;
  quantity: number;
  unitCost: number;
}

const TYPE_LABELS: Record<string, string> = {
  PART: "Запчасть",
  CUSTOM: "Другое",
  FEE: "Комиссия",
  SERVICE: "Услуга",
};

export function SupplierOrderForm({
  suppliers,
  parts,
}: {
  suppliers: SupplierOption[];
  parts: PartOption[];
}) {
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

  function addItem() {
    setItems([...items, { type: "CUSTOM", partId: null, description: "", quantity: 1, unitCost: 0 }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function selectPart(index: number, partId: string) {
    const part = parts.find((p) => p.id === partId);
    if (part) {
      updateItem(index, {
        partId,
        description: `${part.name} (${part.article})`,
        unitCost: part.price,
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
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
      {error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Basic info */}
      <div className="card space-y-4">
        <h2 className="font-semibold">Основная информация</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Поставщик *</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input" required>
              <option value="">Выберите...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Номер заказа (у поставщика)</label>
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Дата заказа *</label>
            <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Ожидаемая дата прибытия</label>
            <input type="date" value={estimatedArrival} onChange={(e) => setEstimatedArrival(e.target.value)} className="input" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Трекинг-номер</label>
          <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="input" placeholder="EB123456789RU" />
        </div>
      </div>

      {/* Items */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Позиции заказа</h2>
          <button type="button" onClick={addItem} className="btn btn-secondary text-xs py-1 px-3">
            + Добавить
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="bg-[var(--background-secondary)] rounded-lg p-3 space-y-2">
              <div className="flex gap-2 items-start">
                <select
                  value={item.type}
                  onChange={(e) => updateItem(i, { type: e.target.value as ItemRow["type"], partId: null })}
                  className="input text-xs w-28 shrink-0"
                >
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                {item.type === "PART" ? (
                  <select
                    value={item.partId ?? ""}
                    onChange={(e) => selectPart(i, e.target.value)}
                    className="input flex-1 text-sm"
                  >
                    <option value="">Выберите запчасть...</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.article}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    className="input flex-1 text-sm"
                    placeholder={
                      item.type === "FEE"
                        ? "SWIFT комиссия, банковский перевод..."
                        : item.type === "SERVICE"
                          ? "Курьер, экспедиция..."
                          : "Описание"
                    }
                  />
                )}
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="text-[var(--color-error)] text-xs mt-2 shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-[var(--foreground-muted)] w-28 shrink-0">Кол-во × цена</span>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(i, { quantity: parseInt(e.target.value) || 1 })}
                  className="input w-20 text-xs"
                />
                <span className="text-[var(--foreground-muted)]">×</span>
                <input
                  type="number"
                  min={0}
                  value={item.unitCost || ""}
                  onChange={(e) => updateItem(i, { unitCost: parseInt(e.target.value) || 0 })}
                  className="input flex-1 text-xs"
                  placeholder="0"
                />
                <span className="text-xs text-[var(--foreground-muted)]">₽</span>
                <span className="text-xs font-medium w-24 text-right shrink-0">
                  = {formatPrice(item.quantity * item.unitCost)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Costs + profit */}
      <div className="card space-y-4">
        <h2 className="font-semibold">Финансы</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Доставка (₽)</label>
            <input
              type="number"
              min={0}
              value={shippingCost || ""}
              onChange={(e) => setShippingCost(parseInt(e.target.value) || 0)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Таможня (₽)</label>
            <input
              type="number"
              min={0}
              value={customsCost || ""}
              onChange={(e) => setCustomsCost(parseInt(e.target.value) || 0)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Ожидаемая выручка (₽)</label>
            <input
              type="number"
              min={0}
              value={sellingPrice || ""}
              onChange={(e) => setSellingPrice(parseInt(e.target.value) || 0)}
              className="input"
            />
          </div>
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
          {sellingPrice > 0 && (
            <div className="flex justify-between pt-2 border-t border-[var(--border)]">
              <span className="text-[var(--foreground-muted)]">Ожидаемая прибыль:</span>
              <span className={`font-bold ${estimatedProfit >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                {formatPrice(estimatedProfit)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="card">
        <label className="block text-sm font-medium mb-2">Заметки</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-[80px] resize-y" />
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <Link href="/admin/suppliers/orders" className="btn btn-secondary">Отмена</Link>
        <div className="flex-1" />
        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting ? "Создание..." : "Создать заказ"}
        </button>
      </div>
    </form>
  );
}
