export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PartsImportForm } from "@/components/admin/PartsImportForm";

export default async function ImportPartsPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">Импорт запчастей (CSV)</h1>
      <PartsImportForm />
    </div>
  );
}
