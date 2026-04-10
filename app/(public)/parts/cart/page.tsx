import { PartsCart } from "@/components/parts/PartsCart";

export default function CartPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-display text-3xl font-bold mb-8 text-center">Корзина</h1>
      <PartsCart />
    </div>
  );
}
