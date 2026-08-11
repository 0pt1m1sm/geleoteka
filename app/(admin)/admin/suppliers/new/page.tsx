export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SupplierNewForm } from "@/components/admin/SupplierNewForm";

export default async function NewSupplierPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-display text-2xl font-bold mb-6">Добавить поставщика</h1>
      <SupplierNewForm />
    </div>
  );
}
