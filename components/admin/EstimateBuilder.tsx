"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { createEstimate } from "@/app/actions/admin";
import { formatPrice } from "@/lib/utils";

interface LineItem {
  type: "WORK" | "PART";
  description: string;
  price: string;
  quantity: string;
}

export function EstimateBuilder({
  appointments,
}: {
  appointments: { id: string; label: string }[];
}) {
  const [state, formAction, isPending] = useActionState(createEstimate, null);
  const [items, setItems] = useState<LineItem[]>([
    { type: "WORK", description: "", price: "", quantity: "1" },
  ]);

  function addItem() {
    setItems([...items, { type: "WORK", description: "", price: "", quantity: "1" }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems(
      items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  }

  const total = items.reduce(
    (sum, item) => sum + (parseInt(item.price) || 0) * (parseInt(item.quantity) || 1),
    0
  );

  return (
    <form action={formAction}>
      <div className="card space-y-4 mb-6">
        {state?.error && (
          <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
            {state.error}
          </div>
        )}

        <div>
          <label htmlFor="appointmentId" className="block text-sm font-medium mb-2">
            Запись *
          </label>
          <select id="appointmentId" name="appointmentId" required className="input">
            <option value="">Выберите запись</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Позиции</h3>
            <button type="button" onClick={addItem} className="btn btn-secondary text-xs py-1 px-3">
              + Добавить
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 items-start p-3 rounded-lg bg-[var(--background-secondary)]">
                <select
                  name="type"
                  value={item.type}
                  onChange={(e) => updateItem(i, "type", e.target.value)}
                  className="input w-28 shrink-0 text-xs"
                >
                  <option value="WORK">Работа</option>
                  <option value="PART">Запчасть</option>
                </select>
                <input
                  name="description"
                  value={item.description}
                  onChange={(e) => updateItem(i, "description", e.target.value)}
                  className="input flex-1 text-sm"
                  placeholder="Описание"
                />
                <input
                  name="quantity"
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, "quantity", e.target.value)}
                  className="input w-16 shrink-0 text-sm"
                  placeholder="Кол"
                  min="1"
                />
                <input
                  name="price"
                  type="number"
                  value={item.price}
                  onChange={(e) => updateItem(i, "price", e.target.value)}
                  className="input w-28 shrink-0 text-sm"
                  placeholder="Цена ₽"
                />
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
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
          <span className="text-[var(--foreground-muted)]">Итого:</span>
          <span className="text-xl font-bold text-[var(--color-accent)]">
            {formatPrice(total)}
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        <Link href="/admin/estimates" className="btn btn-secondary">
          Отмена
        </Link>
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? "Создание..." : "Создать и отправить клиенту"}
        </button>
      </div>
    </form>
  );
}
