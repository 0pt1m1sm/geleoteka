export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { Button, Card, PageHeader } from "@/components/ui";
import { DeleteServiceButton } from "@/components/admin/DeleteServiceButton";

interface ServiceRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
}

export default async function AdminServicesPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const services = (await db.service.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      priceMin: true,
      priceMax: true,
      durationMinutes: true,
    },
  })) as ServiceRow[];

  return (
    <div>
      <PageHeader
        eyebrow="Услуги"
        title="Каталог услуг"
        description={`Всего: ${services.length}`}
        actions={
          <Link href="/admin/services/new">
            <Button size="sm" leftIcon={<Plus size={14} />}>Добавить</Button>
          </Link>
        }
      />

      {services.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)] mb-4">Услуг пока нет</p>
          <Link href="/admin/services/new">
            <Button size="sm">Добавить первую</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {services.map((s) => {
            const priceLabel =
              s.priceMin && s.priceMax
                ? `${formatPrice(s.priceMin)} – ${formatPrice(s.priceMax)}`
                : s.priceMin
                ? `от ${formatPrice(s.priceMin)}`
                : s.priceMax
                ? `до ${formatPrice(s.priceMax)}`
                : "Цена по запросу";
            return (
              <div
                key={s.id}
                className="card flex items-center justify-between gap-4"
              >
                <Link
                  href={`/admin/services/${s.id}`}
                  className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
                >
                  <p className="font-medium truncate">{s.name}</p>
                  <p className="text-xs text-[var(--foreground-muted)] font-mono mt-0.5">
                    {s.slug}
                    {s.durationMinutes ? ` · ${s.durationMinutes} мин` : ""}
                  </p>
                </Link>
                <div className="text-right shrink-0">
                  <p className="font-bold text-[var(--color-accent)] text-sm">
                    {priceLabel}
                  </p>
                </div>
                <DeleteServiceButton serviceId={s.id} serviceName={s.name} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
