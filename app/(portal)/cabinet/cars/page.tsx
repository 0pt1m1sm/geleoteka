export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export default async function CarsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const cars = await db.car.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-display text-2xl font-bold">Мои автомобили</h1>
        <Link href="/cabinet/cars/add" className="btn btn-primary text-sm">
          + Добавить
        </Link>
      </div>

      {cars.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)] mb-4">
            Вы ещё не добавили ни одного автомобиля
          </p>
          <Link href="/cabinet/cars/add" className="btn btn-primary">
            Добавить автомобиль
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cars.map((car: Record<string, unknown>) => (
            <div key={car.id as string} className="card">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
