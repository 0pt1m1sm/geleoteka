export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { CustomerEstimateView } from "@/components/portal/CustomerEstimateView";

interface EstimateFull {
  id: string;
  number: string | null;
  stage: string;
  notes: string | null;
  validUntil: Date | null;
  sentAt: Date | null;
  approvedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  subtotalLabor: number;
  subtotalParts: number;
  subtotalRental: number;
  discount: number;
  total: number;
  estimateLines: Array<{
    id: string;
    type: string;
    description: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
  deal: {
    customerUserId: string;
    vehicle: { make: string; model: string; year: number } | null;
  };
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CabinetEstimateDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const estimate = (await db.estimate.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      stage: true,
      notes: true,
      validUntil: true,
      sentAt: true,
      approvedAt: true,
      declinedAt: true,
      declineReason: true,
      subtotalLabor: true,
      subtotalParts: true,
      subtotalRental: true,
      discount: true,
      total: true,
      estimateLines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          type: true,
          description: true,
          qty: true,
          unitPrice: true,
          total: true,
        },
      },
      deal: {
        select: {
          customerUserId: true,
          vehicle: { select: { make: true, model: true, year: true } },
        },
      },
    },
  })) as EstimateFull | null;
  if (!estimate) notFound();
  if (estimate.deal.customerUserId !== session.id) notFound();

  return (
    <div>
      <div className="mb-4 text-xs">
        <Link
          href="/cabinet/estimates"
          className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
        >
          ← К списку смет
        </Link>
      </div>
      <CustomerEstimateView
        estimate={{
          ...estimate,
          vehicle: estimate.deal.vehicle,
        }}
        printHref={`/api/estimates/${estimate.id}/pdf`}
      />
    </div>
  );
}
