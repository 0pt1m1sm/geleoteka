"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { cartStore, cartItemCount } from "@/lib/parts-cart-store";

/**
 * Basket icon link used in the public Header. Renders a count badge over
 * the icon when the cart is non-empty. Subscribes to cartStore so add/remove
 * updates from any page propagate live.
 */
export function CartIconLink(): React.ReactElement {
  const items = cartStore.useStore();
  const count = cartItemCount(items);

  return (
    <Link href="/parts/cart" className="btn-icon relative" aria-label={`Корзина${count > 0 ? `, ${count} товаров` : ""}`}>
      <ShoppingCart size={20} aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-accent)] text-black text-[10px] font-bold leading-none flex items-center justify-center"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
