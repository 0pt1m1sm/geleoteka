export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { getActiveModelsWithTrims } from "@/lib/vehicle-catalog";
import { Step1ServiceVehicle } from "@/components/booking/Step1ServiceVehicle";
import { StepIndicator } from "@/components/booking/StepIndicator";

interface ServiceItem {
  id: string;
  slug: string;
  name: string;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
}

export default async function BookingStep1() {
  const [rawServices, models] = await Promise.all([
    db.service.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        priceMin: true,
        priceMax: true,
        durationMinutes: true,
      },
    }) as Promise<ServiceItem[]>,
    getActiveModelsWithTrims(),
  ]);
  // Pin "Другое" (slug: other) to the bottom — it's the diagnostic catch-all,
  // belongs after the named services regardless of alphabetical position.
  const services: ServiceItem[] = [
    ...rawServices.filter((s) => s.slug !== "other"),
    ...rawServices.filter((s) => s.slug === "other"),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <StepIndicator current={1} />
      <h1 className="text-display text-3xl font-bold mb-2 text-center">
        Запись на сервис
      </h1>
      <p className="text-foreground-muted text-center mb-8">
        Услуги и автомобиль — шаг 1 из 3
      </p>
      <Step1ServiceVehicle services={services} models={models} />
    </div>
  );
}
