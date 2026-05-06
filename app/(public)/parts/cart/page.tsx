import { getDefaultContact } from "@/lib/session-defaults";
import { PartsCart } from "@/components/parts/PartsCart";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const defaultContact = await getDefaultContact();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-display text-3xl font-bold mb-8 text-center">Корзина</h1>
      <PartsCart defaultContact={defaultContact ?? undefined} />
    </div>
  );
}
