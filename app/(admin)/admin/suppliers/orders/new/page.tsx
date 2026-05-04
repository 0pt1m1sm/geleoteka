export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SupplierOrderForm } from "@/components/admin/SupplierOrderForm";

export default async function NewSupplierOrderPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const [suppliers, parts] = await Promise.all([
    db.user.findMany({
      where: { isSupplier: true, supplierProfile: { isActive: true } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.part.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, article: true, price: true },
    }),
  ]);

  const supplierOptions = suppliers.map((s: Record<string, unknown>) => ({
    id: s.id as string,
    name: s.name as string,
  }));

  const partOptions = parts.map((p: Record<string, unknown>) => ({
    id: p.id as string,
    name: p.name as string,
    article: p.article as string,
    price: p.price as number,
  }));

  if (supplierOptions.length === 0) {
    return (
      <div className="max-w-2xl">
        <Link
          href="/admin/suppliers/orders"
          className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] inline-block mb-2"
        >
          ← Заказы поставщикам
        </Link>
        <h1 className="text-display text-2xl font-bold mb-6">Новый заказ поставщику</h1>
        <div className="card text-center py-12 space-y-4">
          <p className="text-[var(--foreground-muted)]">
            Сначала добавьте хотя бы одного поставщика, чтобы оформить заказ.
          </p>
          <Link href="/admin/suppliers/new" className="btn btn-primary text-sm inline-block">
            + Добавить поставщика
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/suppliers/orders"
        className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] inline-block mb-2"
      >
        ← Заказы поставщикам
      </Link>
      <h1 className="text-display text-2xl font-bold mb-6">Новый заказ поставщику</h1>
      <SupplierOrderForm suppliers={supplierOptions} parts={partOptions} />
    </div>
  );
}
