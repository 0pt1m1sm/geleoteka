export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { CustomerCreateForm } from "@/components/admin/customers/CustomerCreateForm";

export default async function NewCustomerPage() {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Новый клиент"
        description="Ручное создание клиента — например, при звонке без онлайн-записи"
        actions={
          <Link href="/admin/customers" className="btn btn-secondary">
            ← Назад к списку
          </Link>
        }
      />
      <CustomerCreateForm />
    </div>
  );
}
