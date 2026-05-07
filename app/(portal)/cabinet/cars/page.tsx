export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Button, Card, PageHeader } from "@/components/ui";

export default async function CarsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const cars = await db.vehicle.findMany({
    where: { ownerUserId: session.id, ownershipType: "CUSTOMER" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Кабинет"
        title="Мои автомобили"
        actions={
          <Link href="/cabinet/cars/add">
            <Button leftIcon={<Plus size={16} />}>Добавить</Button>
          </Link>
        }
      />

      {cars.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)] mb-4">
            Вы ещё не добавили ни одного автомобиля
          </p>
          <Link href="/cabinet/cars/add" className="btn btn-primary">
            Добавить автомобиль
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cars.map((car: Record<string, unknown>) => (
            <Card key={car.id as string} hover>
              <h3 className="font-semibold text-lg">
                Mercedes-Benz {car.model as string}
              </h3>
              <p className="text-sm text-[var(--foreground-muted)]">
                {car.year as number} г. · {((car.mileage as number) || 0).toLocaleString("ru-RU")} км
              </p>
              {car.vin ? (
                <p className="text-xs text-[var(--foreground-muted)] font-mono mt-1">
                  VIN: {car.vin as string}
                </p>
              ) : null}
              {car.plate ? (
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  Номер: {car.plate as string}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
