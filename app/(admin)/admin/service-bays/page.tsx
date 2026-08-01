export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/tenant";
import { PageHeader } from "@/components/ui";
import { ServiceBayManager, type ServiceBayRow } from "@/components/admin/ServiceBayManager";

export default async function ServiceBaysPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await roleHasPermission(session.permissionRole, "service.manage"))) redirect("/");

  const rows = (await db.serviceBay.findMany({
    where: { tenantKey: TENANT_KEY },
    select: {
      id: true,
      name: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { slots: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })) as Array<Omit<ServiceBayRow, "slotCount"> & { _count: { slots: number } }>;

  const bays = rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    slotCount: row._count.slots,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Сервис"
        title="Рабочие посты"
        description="Физические места обслуживания и фактическая ёмкость расписания"
      />
      <ServiceBayManager bays={bays} />
    </div>
  );
}
