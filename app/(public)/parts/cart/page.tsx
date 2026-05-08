import { getDefaultContact } from "@/lib/session-defaults";
import { getSession } from "@/lib/auth";
import { PartsCart } from "@/components/parts/PartsCart";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const [defaultContact, session] = await Promise.all([
    getDefaultContact(),
    getSession(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-display text-3xl font-bold mb-8 text-center">Корзина</h1>
      <PartsCart
        defaultContact={defaultContact ?? undefined}
        currentUserId={session?.id}
      />
    </div>
  );
}
