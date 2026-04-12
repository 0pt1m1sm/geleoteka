export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SupplierOrderForm } from "@/components/admin/SupplierOrderForm";

export default async function NewSupplierOrderPage() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }

  const [suppliers, parts] = await Promise.all([
    db.supplier.findMany({
      where: { isActive: true },
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

  return (
    <div className="max-w-4xl">
      <h1 className="text-display text-2xl font-bold mb-6">Новый заказ поставщику</h1>
      <SupplierOrderForm suppliers={supplierOptions} parts={partOptions} />
    </div>
  );
}
