export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { PageHeader } from "@/components/ui";
import { ServiceForm } from "@/components/admin/ServiceForm";
import { faqToBlocks, normalizeFaq } from "@/lib/service-content";

interface Props {
  params: Promise<{ id: string }>;
}

interface ServiceRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  body: string | null;
  faq: unknown;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
}

export default async function EditServicePage({ params }: Props) {
  // Через шов изоляции: условие по арендатору добавляется само.
  const db = await tenantDb();
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const service = (await db.service.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      body: true,
      faq: true,
      priceMin: true,
      priceMax: true,
      durationMinutes: true,
    },
  })) as ServiceRow | null;

  if (!service) notFound();

  return (
    <div>
      <PageHeader eyebrow="Услуги" title={service.name} />
      <ServiceForm
        initial={{ ...service, faqBlocks: faqToBlocks(normalizeFaq(service.faq)) }}
      />
    </div>
  );
}
