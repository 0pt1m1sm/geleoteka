"use client";

import Link from "next/link";

interface PartInfo {
  id: string;
  slug: string;
  name: string;
  article: string;
  price: number;
  quantity: number;
}

export function AddToCartButton({ part }: { part: PartInfo }) {
  function addToCart() {
    const CART_KEY = "parts-cart";
    const stored = localStorage.getItem(CART_KEY);
    const items: Array<{ partId: string; name: string; article: string; price: number; qty: number }> =
      stored ? JSON.parse(stored) : [];

    const existing = items.find((i) => i.partId === part.id);
    if (existing) {
      existing.qty += 1;
    } else {
      items.push({ partId: part.id, name: part.name, article: part.article, price: part.price, qty: 1 });
    }

    localStorage.setItem(CART_KEY, JSON.stringify(items));
    alert("Добавлено в корзину!");
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={addToCart}
        className="btn btn-primary w-full text-center"
      >
        В корзину
      </button>
      <Link href="/parts/cart" className="btn btn-secondary w-full text-center">
        Перейти в корзину
      </Link>
    </div>
  );
}
