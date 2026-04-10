"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { createPartOrder } from "@/app/actions/part-orders";

interface CartItem {
  partId: string;
  name: string;
  article: string;
  price: number;
  qty: number;
}

const CART_KEY = "parts-cart";

let cartListeners: Array<() => void> = [];
const EMPTY_CART: CartItem[] = [];
let cachedCartRaw: string | null = null;
let cachedCartItems: CartItem[] = EMPTY_CART;

function subscribeCart(cb: () => void) {
  cartListeners.push(cb);
  return () => { cartListeners = cartListeners.filter((l) => l !== cb); };
}

function getCartSnapshot(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (raw !== cachedCartRaw) {
      cachedCartRaw = raw;
      cachedCartItems = raw ? JSON.parse(raw) : EMPTY_CART;
    }
  } catch {}
  return cachedCartItems;
}

function setCartStorage(items: CartItem[]) {
  const raw = JSON.stringify(items);
  cachedCartRaw = raw;
  cachedCartItems = items;
  localStorage.setItem(CART_KEY, raw);
  cartListeners.forEach((l) => l());
}

function getCartServerSnapshot(): CartItem[] {
  return EMPTY_CART;
}

export function PartsCart() {
  const items = useSyncExternalStore(subscribeCart, getCartSnapshot, getCartServerSnapshot);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; orderId?: string; error?: string } | null>(null);

  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  function updateQty(partId: string, qty: number) {
    if (qty <= 0) {
      setCartStorage(items.filter((i) => i.partId !== partId));
    } else {
      setCartStorage(items.map((i) => i.partId === partId ? { ...i, qty } : i));
    }
  }

  function removeItem(partId: string) {
    setCartStorage(items.filter((i) => i.partId !== partId));
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
      localStorage.removeItem(CART_KEY);
      cartListeners.forEach((l) => l());
    }
  }

  if (result?.success) {
    return (
      <div className="card text-center py-12">
        <div className="w-16 h-16 rounded-full bg-[var(--color-success-bg)] mx-auto mb-6 flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-display text-2xl font-bold mb-2">Заказ оформлен!</h2>
        <p className="text-[var(--foreground-muted)] mb-6">
          Мы свяжемся с вами для подтверждения. Оплата при получении или по реквизитам.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/parts" className="btn btn-secondary">Продолжить покупки</Link>
          <Link href="/cabinet/orders" className="btn btn-primary">Мои заказы</Link>
        </div>
      </div>
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
          <div key={item.partId} className="card flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.name}</p>
              <p className="text-xs text-[var(--foreground-muted)] font-mono">{item.article}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => updateQty(item.partId, item.qty - 1)} className="btn btn-secondary text-xs px-2 py-1">−</button>
              <span className="w-8 text-center text-sm">{item.qty}</span>
              <button type="button" onClick={() => updateQty(item.partId, item.qty + 1)} className="btn btn-secondary text-xs px-2 py-1">+</button>
            </div>
            <p className="font-bold text-[var(--color-accent)] w-24 text-right">
              {formatPrice(item.price * item.qty)}
            </p>
            <button type="button" onClick={() => removeItem(item.partId)} className="text-[var(--color-error)] text-xs">×</button>
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
        <h2 className="font-semibold">Контактные данные</h2>
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">Имя *</label>
          <input id="name" name="name" required className="input" placeholder="Иван Иванов" />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон *</label>
          <input id="phone" name="phone" type="tel" required className="input" placeholder="+7 (999) 123-45-67" />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">Email *</label>
          <input id="email" name="email" type="email" required className="input" placeholder="your@email.com" />
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
