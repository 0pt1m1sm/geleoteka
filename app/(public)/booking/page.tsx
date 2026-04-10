export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { ServiceSelector } from "@/components/booking/ServiceSelector";
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
  const services: ServiceItem[] = await db.service.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      priceMin: true,
      priceMax: true,
      durationMinutes: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <StepIndicator current={1} />
      <h1 className="text-display text-3xl font-bold mb-2 text-center">
        Выберите услуги
      </h1>
      <p className="text-[var(--foreground-muted)] text-center mb-8">
        Можно выбрать несколько
      </p>
      <ServiceSelector services={services} />
    </div>
  );
}
