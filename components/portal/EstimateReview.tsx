"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/utils";
import { respondToEstimateItem } from "@/app/actions/estimates";

interface EstimateItem {
  id: string;
  type: string;
  description: string;
  quantity: number;
  unitPrice: number;
  approved: boolean | null;
}

interface Estimate {
  id: string;
  total: number;
  status: string;
  carModel: string;
  items: EstimateItem[];
}

export function EstimateReview({ estimates }: { estimates: Estimate[] }) {
  return (
    <div className="space-y-6">
      {estimates.map((est) => (
        <EstimateCard key={est.id} estimate={est} />
      ))}
    </div>
  );
}

function EstimateCard({ estimate }: { estimate: Estimate }) {
  const [items, setItems] = useState(estimate.items);

  const approvedTotal = items
    .filter((item) => item.approved !== false)
    .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  async function handleResponse(itemId: string, approved: boolean) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, approved } : item
      )
    );
    await respondToEstimateItem(itemId, approved);
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">
          Mercedes-Benz {estimate.carModel}
        </h3>
        <p className="text-lg font-bold text-[var(--color-accent)]">
          {formatPrice(approvedTotal)}
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between gap-4 p-3 rounded-lg transition-colors ${
              item.approved === false
                ? "bg-[var(--color-error-bg)] opacity-60"
                : item.approved === true
                  ? "bg-[var(--color-success-bg)]"
                  : "bg-[var(--background-secondary)]"
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase text-[var(--foreground-muted)] bg-[var(--card)] px-1.5 py-0.5 rounded">
                  {item.type === "WORK" ? "Работа" : "Запчасть"}
                </span>
                <span className="text-sm font-medium">{item.description}</span>
              </div>
              <p className="text-sm text-[var(--foreground-muted)] mt-1">
                {item.quantity} × {formatPrice(item.unitPrice)} ={" "}
                {formatPrice(item.unitPrice * item.quantity)}
              </p>
            </div>

            {item.approved === null && (
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleResponse(item.id, true)}
                  className="btn btn-primary text-xs py-1 px-3"
                >
                  Да
                </button>
                <button
                  type="button"
                  onClick={() => handleResponse(item.id, false)}
                  className="btn btn-secondary text-xs py-1 px-3"
                >
                  Нет
                </button>
              </div>
            )}

            {item.approved === true && (
              <span className="text-xs text-[var(--color-success)] font-medium">
                Одобрено
              </span>
            )}
            {item.approved === false && (
              <span className="text-xs text-[var(--color-error)] font-medium line-through">
                Отклонено
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
