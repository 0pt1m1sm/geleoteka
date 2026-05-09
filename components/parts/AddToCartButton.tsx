"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { addToCart } from "@/lib/parts-cart-store";

interface PartInfo {
  id: string;
  slug: string;
  name: string;
  article: string;
  price: number;
  quantity: number;
}

export function AddToCartButton({ part }: { part: PartInfo }) {
  const [justAdded, setJustAdded] = useState(false);

  function handleClick(): void {
    addToCart({
      partId: part.id,
      name: part.name,
      article: part.article,
      price: part.price,
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1500);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleClick}
        aria-live="polite"
        className={`btn w-full text-center transition-colors ${
          justAdded ? "btn-secondary" : "btn-primary"
        }`}
      >
        {justAdded ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Check size={16} aria-hidden /> Добавлено в корзину
          </span>
        ) : (
          "В корзину"
        )}
      </button>
      <Link href="/parts/cart" className="btn btn-secondary w-full text-center">
        Перейти в корзину
      </Link>
    </div>
  );
}
