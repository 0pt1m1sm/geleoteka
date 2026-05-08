export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

interface ServiceDetail {
  slug: string;
  name: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
  applicableModels: string[];
}

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  const service: ServiceDetail | null = await db.service.findUnique({ where: { slug } });

  if (!service) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <nav className="mb-8 text-sm text-[var(--foreground-muted)]">
        <Link href="/" className="hover:text-[var(--foreground)]">
          Главная
        </Link>
        {" / "}
        <Link href="/services" className="hover:text-[var(--foreground)]">
          Услуги
        </Link>
        {" / "}
        <span className="text-[var(--foreground)]">{service.name}</span>
      </nav>

      <h1 className="text-display text-4xl font-bold mb-4">{service.name}</h1>

      {(service.priceMin || service.priceMax) && (
        <div className="flex items-center gap-2 mb-8">
          <span className="text-2xl font-semibold text-[var(--color-accent)]">
            {service.priceMin && service.priceMax
              ? `${formatPrice(service.priceMin)} — ${formatPrice(service.priceMax)}`
              : service.priceMin
                ? `от ${formatPrice(service.priceMin)}`
                : `до ${formatPrice(service.priceMax!)}`}
          </span>
        </div>
      )}

      <div className="card mb-8">
        <p className="text-[var(--foreground-muted)] leading-relaxed text-lg">
          {service.description}
        </p>
      </div>

      {service.applicableModels.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-lg font-semibold mb-4">Применимые модели</h2>
          <div className="flex flex-wrap gap-2">
            {service.applicableModels.map((model: string) => (
              <Link
                key={model}
                href={`/models/${model.toLowerCase().replace(/\s+/g, "-")}`}
                className="badge badge-silver hover:border-[var(--color-accent)] transition-colors"
              >
                {model}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <Link href="/booking" className="btn btn-primary">
          Записаться на сервис
        </Link>
        <Link href="/services" className="btn btn-secondary">
          Все услуги
        </Link>
      </div>
    </div>
  );
}
