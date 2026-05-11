export const dynamic = "force-dynamic";

import type { Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { EstimatePrintView } from "@/components/portal/EstimatePrintView";
import { loadRequisites } from "@/lib/load-requisites";

// Desktop viewport for iOS Safari Share → Print to capture full doc.
export const viewport: Viewport = {
  width: 820,
  initialScale: 1,
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ auto?: string }>;
}

interface PrintEstimate {
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
  deal: {
    vehicle: { make: string; model: string; year: number; vin: string | null } | null;
    customer: { name: string; phone: string; email: string };
  };
}

export default async function AdminEstimatePrintPage({ params, searchParams }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const autoPrint = sp.auto === "1";

  const [estimate, requisites] = await Promise.all([
    db.estimate.findUnique({
      where: { id },
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
        deal: {
          select: {
            vehicle: { select: { make: true, model: true, year: true, vin: true } },
            customer: { select: { name: true, phone: true, email: true } },
          },
        },
      },
    }) as Promise<PrintEstimate | null>,
    loadRequisites(),
  ]);
  if (!estimate) notFound();

  return (
    <EstimatePrintView
      autoPrint={autoPrint}
      estimate={{
        ...estimate,
        vehicle: estimate.deal.vehicle,
        customer: estimate.deal.customer,
      }}
      requisites={requisites}
    />
  );
}
