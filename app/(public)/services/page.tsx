export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import { Markdown } from "@/components/shared/Markdown";
import { getCMSText, getCMSRichtext } from "@/lib/cms";

interface ServiceData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
}

export default async function ServicesPage(): Promise<React.ReactElement> {
  const [servicesRaw, eyebrow, title, description, ctaText, ctaButton] = await Promise.all([
    db.service.findMany({
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, description: true, priceMin: true, priceMax: true },
    }) as Promise<ServiceData[]>,
    getCMSText("services.eyebrow"),
    getCMSText("services.title"),
    getCMSText("services.description"),
    getCMSRichtext("services.cta.text"),
    getCMSText("services.cta.button"),
  ]);

  // Pin "Другое" (slug: other) to the bottom — it's the catch-all for users
  // who don't see their need in the list and want to leave a free-form note.
  const services = servicesRaw.slice().sort((a, b) => {
    if (a.slug === "other") return 1;
    if (b.slug === "other") return -1;
    return 0;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        align="center"
        className="mb-12"
      />

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
        <div className="text-[var(--foreground-muted)] mb-4">
          <Markdown source={ctaText} />
        </div>
        <Link href="/contacts" className="btn btn-secondary">
          {ctaButton}
        </Link>
      </div>
    </div>
  );
}
