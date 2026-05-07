"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { createPartOrder } from "@/app/actions/part-orders";
import { createLocalStorageStore } from "@/lib/local-storage-store";
import { SuccessCard } from "@/components/shared/SuccessCard";

interface CartItem {
  partId: string;
  name: string;
  article: string;
  price: number;
  qty: number;
}

const EMPTY_CART: CartItem[] = [];
const cartStore = createLocalStorageStore<CartItem[]>("parts-cart", EMPTY_CART);

interface DefaultContact {
  name?: string;
  phone?: string;
  email?: string;
}

export function PartsCart({ defaultContact }: { defaultContact?: DefaultContact } = {}) {
  const items = cartStore.useStore();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; orderId?: string; error?: string } | null>(null);

  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  function updateQty(partId: string, qty: number) {
    if (qty <= 0) {
      cartStore.setStore(items.filter((i) => i.partId !== partId));
    } else {
      cartStore.setStore(items.map((i) => i.partId === partId ? { ...i, qty } : i));
    }
  }

  function removeItem(partId: string) {
    cartStore.setStore(items.filter((i) => i.partId !== partId));
  }

  async function handleCheckout(formData: FormData) {
    setSubmitting(true);
    const res = await createPartOrder({
      items: items.map((i) => ({ partId: i.partId, quantity: i.qty })),
      contactName: formData.get("name") as string,
      contactPhone: formData.get("phone") as string,
      contactEmail: formData.get("email") as string,
      notes: (formData.get("notes") as string) || "",
    });
    setResult(res);
    setSubmitting(false);
    if (res.success) {
      cartStore.setStore(EMPTY_CART);
    }
  }

  if (result?.success) {
    return (
      <SuccessCard
        heading="Заказ оформлен!"
        message="Мы свяжемся с вами для подтверждения. Оплата при получении или по реквизитам."
      >
        <Link href="/parts" className="btn btn-secondary">Продолжить покупки</Link>
        <Link href="/cabinet/orders" className="btn btn-primary">Мои заказы</Link>
      </SuccessCard>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-[var(--foreground-muted)] mb-4">Корзина пуста</p>
        <Link href="/parts" className="btn btn-primary">Перейти в каталог</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-3 mb-8">
        {items.map((item) => (
          <div key={item.partId} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.name}</p>
              <p className="mt-0.5 text-xs text-[var(--foreground-muted)] font-mono">{item.article}</p>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Уменьшить" onClick={() => updateQty(item.partId, item.qty - 1)} className="btn btn-secondary text-sm px-3 py-1">−</button>
                <span className="w-6 text-center text-sm tabular-nums">{item.qty}</span>
                <button type="button" aria-label="Увеличить" onClick={() => updateQty(item.partId, item.qty + 1)} className="btn btn-secondary text-sm px-3 py-1">+</button>
              </div>
              <p className="font-bold text-[var(--color-accent)] tabular-nums sm:w-28 sm:text-right">
                {formatPrice(item.price * item.qty)}
              </p>
              <button
                type="button"
                aria-label="Удалить"
                onClick={() => removeItem(item.partId)}
                className="text-[var(--color-error)] text-lg px-1 hover:opacity-70"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card mb-8">
        <div className="flex items-center justify-between text-lg">
          <span>Итого:</span>
          <span className="font-bold text-[var(--color-accent)]">{formatPrice(total)}</span>
        </div>
      </div>

      {result?.error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm mb-6">
          {result.error}
        </div>
      )}

      <form action={handleCheckout} className="card space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Контактные данные</h2>
          {defaultContact?.email && (
            <p className="text-xs text-[var(--foreground-muted)]">
              Заполнено из профиля
            </p>
          )}
        </div>
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">Имя *</label>
          <input id="name" name="name" required className="input" placeholder="Иван Иванов" defaultValue={defaultContact?.name ?? ""} />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон *</label>
          <input id="phone" name="phone" type="tel" required className="input" placeholder="+7 (999) 123-45-67" defaultValue={defaultContact?.phone ?? ""} />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">Email *</label>
          <input id="email" name="email" type="email" required className="input" placeholder="your@email.com" defaultValue={defaultContact?.email ?? ""} />
        </div>
        <div>
          <label htmlFor="notes" className="block text-sm font-medium mb-2">Комментарий</label>
          <textarea id="notes" name="notes" className="input min-h-[60px] resize-y" placeholder="Доставка, самовывоз..." />
        </div>
        <button type="submit" disabled={submitting} className="btn btn-primary w-full">
          {submitting ? "Оформление..." : `Оформить заказ — ${formatPrice(total)}`}
        </button>
      </form>
    </div>
  );
}
