export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { StatusBoard } from "@/components/portal/StatusBoard";
import { Card, PageHeader } from "@/components/ui";
import { WorkPhotosGallery } from "@/components/shared/WorkPhotosGallery";

interface ActiveRepairOrder {
  id: string;
  status: string;
  dateTime: string;
  carModel: string;
  services: string[];
}

interface PhotoEntry {
  id: string;
  url: string;
  caption: string | null;
  createdAt: Date;
}

interface RepairOrderWithPhotos {
  id: string;
  vehicle: { model: string };
  workPhotos: PhotoEntry[];
}

export default async function TrackingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const repairOrders = (await db.repairOrder.findMany({
    where: {
      userId: session.id,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    include: {
      vehicle: { select: { model: true } },
      jobLines: { select: { description: true }, orderBy: { sortOrder: "asc" } },
      workPhotos: {
        select: { id: true, url: true, caption: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { dateTime: "asc" },
  })) as unknown as Array<RepairOrderWithPhotos & {
    status: string;
    dateTime: Date;
    jobLines: Array<{ description: string }>;
  }>;

  const active: ActiveRepairOrder[] = repairOrders.map((ro) => ({
    id: ro.id,
    status: ro.status,
    dateTime: ro.dateTime.toISOString(),
    carModel: ro.vehicle.model,
    services: ro.jobLines.map((j) => j.description),
  }));

  const photoSections = repairOrders.filter((ro) => ro.workPhotos.length > 0);

  return (
    <div>
      <PageHeader eyebrow="Кабинет" title="Статус ремонта" />
      {active.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">Нет активных заказ-нарядов</p>
        </Card>
      ) : (
        <>
          <StatusBoard initial={active} />
          {photoSections.length > 0 && (
            <div className="mt-8 space-y-6">
              {photoSections.map((ro) => (
                <Card key={ro.id}>
                  <WorkPhotosGallery
                    title={`Фотоотчёт — ${ro.vehicle.model}`}
                    photos={ro.workPhotos}
                    emptyText={null}
                  />
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
