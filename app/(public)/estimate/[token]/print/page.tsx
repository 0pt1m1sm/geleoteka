export const dynamic = "force-dynamic";

import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EstimatePrintView } from "@/components/portal/EstimatePrintView";
import { loadRequisites } from "@/lib/load-requisites";

// Force a desktop-width layout on mobile so the PDF preview captures
// the full document instead of clipping the right edge. iOS Safari's
// Share → Print uses the live viewport, not @page.
export const viewport: Viewport = {
  width: 820,
  initialScale: 1,
};

interface Props {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ estimate?: string; auto?: string }>;
}

interface DealMin {
  id: string;
  claimToken: string | null;
  vehicle: { make: string; model: string; year: number; vin: string | null } | null;
  customer: { name: string; phone: string; email: string };
  estimates: Array<{
    id: string;
    number: string | null;
    stage: string;
    validUntil: Date | null;
    sentAt: Date | null;
    createdAt: Date;
    subtotalLabor: number;
    subtotalParts: number;
    subtotalRental: number;
    discount: number;
    tax: number;
    total: number;
    estimateLines: Array<{
      id: string;
      type: string;
      description: string;
      qty: number;
      unitPrice: number;
      total: number;
    }>;
  }>;
}

export default async function GuestEstimatePrintPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = searchParams ? await searchParams : {};
  const targetId = sp.estimate;
  const autoPrint = sp.auto === "1";

  const [deal, requisites] = await Promise.all([
    db.deal.findFirst({
      where: { claimToken: token },
      select: {
        id: true,
        claimToken: true,
        vehicle: { select: { make: true, model: true, year: true, vin: true } },
        customer: { select: { name: true, phone: true, email: true } },
        estimates: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            number: true,
            stage: true,
            validUntil: true,
            sentAt: true,
            createdAt: true,
            subtotalLabor: true,
            subtotalParts: true,
            subtotalRental: true,
            discount: true,
            tax: true,
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
          },
        },
      },
    }) as Promise<DealMin | null>,
    loadRequisites(),
  ]);

  if (!deal) notFound();
  const estimate = targetId
    ? deal.estimates.find((e) => e.id === targetId)
    : deal.estimates.find((e) => e.stage === "SENT" || e.stage === "DRAFT") ??
      deal.estimates[0];
  if (!estimate) notFound();

  return (
    <EstimatePrintView
      autoPrint={autoPrint}
      estimate={{
        ...estimate,
        vehicle: deal.vehicle,
        customer: deal.customer,
      }}
      requisites={requisites}
    />
  );
}
