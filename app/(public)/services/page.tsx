export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

interface ServiceData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
}

export default async function ServicesPage() {
  const services: ServiceData[] = await db.service.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      priceMin: true,
      priceMax: true,
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-display text-4xl sm:text-5xl font-bold mb-4">
          Услуги
        </h1>
        <p className="text-[var(--foreground-muted)] max-w-2xl mx-auto text-lg">
          Полный спектр работ по обслуживанию и ремонту автомобилей
          Mercedes-Benz
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <Link
            key={service.id}
            href={`/services/${service.slug}`}
            className="card card-hover group flex flex-col"
          >
            <h2 className="text-lg font-semibold mb-2 group-hover:text-[var(--color-accent)] transition-colors">
              {service.name}
            </h2>
            <p className="text-sm text-[var(--foreground-muted)] mb-4 flex-1 line-clamp-3">
              {service.description}
            </p>
            {(service.priceMin || service.priceMax) && (
              <div className="text-[var(--color-accent)] text-sm font-medium">
                {service.priceMin
                  ? `от ${formatPrice(service.priceMin)}`
                  : `до ${formatPrice(service.priceMax!)}`}
              </div>
            )}
          </Link>
        ))}
      </div>

      <div className="text-center mt-16">
        <p className="text-[var(--foreground-muted)] mb-4">
          Не нашли нужную услугу? Свяжитесь с нами.
        </p>
        <Link href="/contacts" className="btn btn-secondary">
          Контакты
        </Link>
      </div>
    </div>
  );
}
