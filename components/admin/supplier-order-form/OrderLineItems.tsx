"use client";

import { Plus, X } from "lucide-react";
import { Button, Card, CardTitle } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import { TYPE_LABELS, type ItemRow, type PartOption } from "./types";

interface OrderLineItemsProps {
  items: ItemRow[];
  setItems: (next: ItemRow[]) => void;
  parts: PartOption[];
}

export function OrderLineItems({
  items,
  setItems,
  parts,
}: OrderLineItemsProps): React.ReactElement {
  function addItem(): void {
    setItems([...items, { type: "CUSTOM", partId: null, description: "", quantity: 1, unitCost: 0 }]);
  }

  function removeItem(index: number): void {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, patch: Partial<ItemRow>): void {
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function selectPart(index: number, partId: string): void {
    const part = parts.find((p) => p.id === partId);
    if (part) {
      updateItem(index, {
        partId,
        description: `${part.name} (${part.article})`,
        unitCost: part.price,
      });
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <CardTitle>Позиции заказа</CardTitle>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addItem}
          leftIcon={<Plus size={14} />}
        >
          Добавить
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="bg-[var(--background-secondary)] rounded-lg p-3 space-y-2">
            <div className="flex gap-2 items-start">
              <select
                value={item.type}
                onChange={(e) => updateItem(i, { type: e.target.value as ItemRow["type"], partId: null })}
                className="input text-xs w-28 shrink-0"
                aria-label="Тип позиции"
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
                  aria-label="Запчасть"
                >
                  <option value="">Выберите запчасть...</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {p.article}</option>
                  ))}
                </select>
              ) : item.type === "NEW_PART" ? (
                <div className="flex-1 flex gap-2">
                  <input
                    value={item.article ?? ""}
                    onChange={(e) => updateItem(i, { article: e.target.value })}
                    className="input w-40 text-sm font-mono"
                    aria-label="Артикул нового товара"
                    placeholder="Артикул"
                  />
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    className="input flex-1 text-sm"
                    aria-label="Название нового товара"
                    placeholder="Название нового товара"
                  />
                </div>
              ) : (
                <input
                  value={item.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                  className="input flex-1 text-sm"
                  aria-label="Описание позиции"
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
                  className="text-[var(--color-error)] mt-2 shrink-0"
                  aria-label="Удалить позицию"
                >
                  <X size={16} aria-hidden />
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
                aria-label="Количество"
              />
              <span className="text-[var(--foreground-muted)]">×</span>
              <input
                type="number"
                min={0}
                value={item.unitCost || ""}
                onChange={(e) => updateItem(i, { unitCost: parseInt(e.target.value) || 0 })}
                className="input flex-1 text-xs"
                placeholder="0"
                aria-label="Цена за единицу"
              />
              <span className="text-xs text-[var(--foreground-muted)]">₽</span>
              <span className="text-xs font-medium w-24 text-right shrink-0">
                = {formatPrice(item.quantity * item.unitCost)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
