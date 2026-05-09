import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ServiceForm } from "@/components/admin/ServiceForm";

export default async function NewServicePage() {
  await requireRole(["ADMIN", "MANAGER"]);

  return (
    <div>
      <PageHeader eyebrow="Услуги" title="Новая услуга" />
      <ServiceForm />
    </div>
  );
}
