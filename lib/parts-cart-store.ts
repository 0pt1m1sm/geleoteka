"use client";

import { createLocalStorageStore } from "@/lib/local-storage-store";

export interface CartItem {
  partId: string;
  name: string;
  article: string;
  price: number;
  qty: number;
}

const EMPTY_CART: CartItem[] = [];

/** Guards against corrupted/foreign JSON in the "parts-cart" key crashing
 * every consumer that assumes an array (PartsCart, CartIconLink, ...). */
function validateCart(parsed: unknown): { ok: CartItem[] } | null {
  if (!Array.isArray(parsed)) return null;
  const items = parsed.filter(
    (item): item is CartItem =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as CartItem).partId === "string" &&
      typeof (item as CartItem).name === "string" &&
      typeof (item as CartItem).article === "string" &&
      typeof (item as CartItem).price === "number" &&
      typeof (item as CartItem).qty === "number",
  );
  return { ok: items };
}

export const cartStore = createLocalStorageStore<CartItem[]>(
  "parts-cart",
  EMPTY_CART,
  validateCart,
);

/** Total quantity across all items in cart — used by Header badge. */
export function cartItemCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}

/** Increment quantity for partId or add it as a new line. */
export function addToCart(part: Omit<CartItem, "qty">): CartItem[] {
  const items = cartStore.getStore();
  const existing = items.find((i) => i.partId === part.partId);
  const next = existing
    ? items.map((i) => (i.partId === part.partId ? { ...i, qty: i.qty + 1 } : i))
    : [...items, { ...part, qty: 1 }];
  cartStore.setStore(next);
  return next;
}

export const EMPTY_PARTS_CART = EMPTY_CART;
