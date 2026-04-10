export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getModelBySlug, MODELS } from "@/lib/models-data";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return MODELS.map((m) => ({ slug: m.slug }));
}

export default async function ModelPage({ params }: Props) {
  const { slug } = await params;
  const model = getModelBySlug(slug);

  if (!model) notFound();

  const services: { id: string; slug: string; name: string; priceMin: number | null }[] =
    await db.service.findMany({
      where: { applicableModels: { has: model.name } },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, priceMin: true },
    });

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <nav className="mb-8 text-sm text-[var(--foreground-muted)]">
        <Link href="/" className="hover:text-[var(--foreground)]">
          Главная
        </Link>
        {" / "}
        <Link href="/models" className="hover:text-[var(--foreground)]">
          Модели
        </Link>
        {" / "}
        <span className="text-[var(--foreground)]">{model.name}</span>
      </nav>

      <h1 className="text-display text-4xl font-bold mb-2">
        Mercedes-Benz {model.name}
      </h1>
      <p className="text-[var(--color-accent)] font-medium mb-8">
        {model.priceNote}
      </p>

      <div className="card mb-8">
        <p className="text-[var(--foreground-muted)] leading-relaxed text-lg">
          {model.description}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] mb-1">
            Поколения
          </h3>
          <p className="font-semibold">{model.generations}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] mb-1">
            Двигатели
          </h3>
          <p className="font-semibold">{model.engines}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] mb-1">
            Ценообразование
          </h3>
          <p className="font-semibold text-[var(--color-accent)]">
            {model.priceNote}
          </p>
        </div>
      </div>

      {model.features.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-lg font-semibold mb-4">Особенности</h2>
          <ul className="space-y-2">
            {model.features.map((feature) => (
              <li
                key={feature}
                className="flex items-center gap-3 text-[var(--foreground-muted)]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      )}

      {services.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">
            Доступные услуги для {model.name}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {services.map((service) => (
              <Link
                key={service.id}
                href={`/services/${service.slug}`}
                className="card card-hover group"
              >
                <h3 className="font-medium group-hover:text-[var(--color-accent)] transition-colors">
                  {service.name}
                </h3>
                {service.priceMin && (
                  <p className="text-sm text-[var(--color-accent)] mt-1">
                    от {formatPrice(service.priceMin)}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <Link href="/booking" className="btn btn-primary">
          Записаться на сервис
        </Link>
        <Link href="/models" className="btn btn-secondary">
          Все модели
        </Link>
      </div>
    </div>
  );
}
