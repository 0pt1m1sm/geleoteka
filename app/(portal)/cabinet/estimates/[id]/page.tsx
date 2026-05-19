export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { CustomerEstimateView } from "@/components/portal/CustomerEstimateView";
import { EstimateRevisionBanner } from "@/components/crm/EstimateRevisionBanner";
import { EstimateLineageBreadcrumb } from "@/components/crm/EstimateLineageBreadcrumb";
import { getEstimateChain } from "@/lib/crm/estimate-chain";

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

  const chain = await getEstimateChain(estimate.id);
  const supersededTarget = estimate.stage === "SUPERSEDED" ? chain.activeRevision : null;
  const cabinetHref = (id: string): string => `/cabinet/estimates/${id}`;

  return (
    <div>
      <div className="mb-4 text-xs">
        <Link href="/cabinet/estimates" className="back-link">
          ← К списку смет
        </Link>
      </div>
      <EstimateRevisionBanner
        mode="revision"
        target={chain.parent}
        href={chain.parent ? cabinetHref(chain.parent.id) : ""}
      />
      <EstimateRevisionBanner
        mode="superseded"
        target={supersededTarget}
        href={supersededTarget ? cabinetHref(supersededTarget.id) : ""}
      />
      <EstimateLineageBreadcrumb
        chain={chain.chain}
        currentId={estimate.id}
        hrefBuilder={cabinetHref}
      />
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
