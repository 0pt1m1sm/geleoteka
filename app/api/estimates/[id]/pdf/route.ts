import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { loadRequisites } from "@/lib/load-requisites";
import {
  EstimatePdfDocument,
  type EstimatePdfData,
  type EstimatePdfExtras,
} from "@/lib/estimate-pdf-document";

/**
 * Server-rendered PDF for a single Estimate. Three valid auth paths:
 *   1. Logged-in ADMIN / MANAGER — any estimate.
 *   2. Logged-in CLIENT — only estimates on their own deals.
 *   3. Guest — query string `?token=<Deal.claimToken>`.
 *
 * Why server-side: iOS Safari's CSS print pipeline doesn't honor
 * `@page`/`@media print` reliably, which led to clipping and broken
 * exports. Generating the PDF on the server with @react-pdf/renderer
 * removes the browser print path from the loop entirely.
 */
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface EstimateRow {
  id: string;
  number: string | null;
  sentAt: Date | null;
  createdAt: Date;
  validUntil: Date | null;
  subtotalLabor: number;
  subtotalParts: number;
  subtotalRental: number;
  discount: number;
  tax: number;
  total: number;
  deal: {
    customerUserId: string;
    claimToken: string | null;
    customer: { name: string; phone: string; email: string };
    vehicle: {
      make: string;
      model: string;
      year: number;
      vin: string | null;
      plate: string | null;
      mileage: number | null;
    } | null;
    owner: { name: string; phone: string; email: string } | null;
    repairOrders: Array<{ mileageIn: number | null }>;
  };
  preparedBy: { name: string } | null;
  estimateLines: Array<{
    id: string;
    type: string;
    description: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
}

/**
 * Resolve the CMS-stored payment-gateway URL template with the current
 * estimate's identifiers. Returns null when the template is empty,
 * after-substitution string is not an absolute http(s) URL — in that
 * case the PDF renders page 2 without the QR block (TS-003).
 */
function resolvePaymentUrl(
  template: string,
  vars: { id: string; number: string },
): string | null {
  if (!template) return null;
  const resolved = template
    .replace(/\{estimateId\}/g, encodeURIComponent(vars.id))
    .replace(/\{number\}/g, encodeURIComponent(vars.number));
  if (!/^https?:\/\//i.test(resolved)) return null;
  return resolved;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  const session = await getSession();

  const estimate = (await db.estimate.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      sentAt: true,
      createdAt: true,
      validUntil: true,
      subtotalLabor: true,
      subtotalParts: true,
      subtotalRental: true,
      discount: true,
      tax: true,
      total: true,
      deal: {
        select: {
          customerUserId: true,
          claimToken: true,
          customer: { select: { name: true, phone: true, email: true } },
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              vin: true,
              plate: true,
              mileage: true,
            },
          },
          owner: { select: { name: true, phone: true, email: true } },
          repairOrders: {
            select: { mileageIn: true },
            orderBy: { dateTime: "desc" },
            take: 1,
          },
        },
      },
      preparedBy: { select: { name: true } },
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
  })) as EstimateRow | null;

  if (!estimate) return new NextResponse("Not found", { status: 404 });

  // Authorisation
  const isStaff =
    session?.permissionRole === "ADMIN" || session?.permissionRole === "MANAGER";
  const isOwner = session?.id === estimate.deal.customerUserId;
  const isGuest =
    !!token && !!estimate.deal.claimToken && token === estimate.deal.claimToken;
  if (!isStaff && !isOwner && !isGuest) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const requisites = await loadRequisites();

  // Resolve the payment-gateway URL from CMS. Approval lives in the
  // customer cabinet — the QR's only job is to take the customer to
  // the payment portal directly. When the template is empty, page 2
  // still renders without the QR (TS-003 in the plan).
  // `estimate.number` is nullable in the schema (prisma/schema.prisma:1130
  // `String?`); use the cuid tail as the defensive fallback so DRAFT
  // estimates without a number still produce a scannable URL.
  const paymentUrl = resolvePaymentUrl(
    requisites.paymentsGatewayUrlTemplate,
    {
      id: estimate.id,
      number:
        estimate.number ?? estimate.id.slice(-6).toUpperCase(),
    },
  );
  let qrDataUrl: string | null = null;
  if (paymentUrl) {
    qrDataUrl = await QRCode.toDataURL(paymentUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#1a1a1a", light: "#ffffff" },
    });
  }
  const extras: EstimatePdfExtras = {
    qrDataUrl,
    qrCaption: "Отсканируйте для оплаты онлайн",
  };

  const data: EstimatePdfData = {
    id: estimate.id,
    number: estimate.number,
    sentAt: estimate.sentAt,
    createdAt: estimate.createdAt,
    validUntil: estimate.validUntil,
    subtotalLabor: estimate.subtotalLabor,
    subtotalParts: estimate.subtotalParts,
    subtotalRental: estimate.subtotalRental,
    discount: estimate.discount,
    tax: estimate.tax,
    total: estimate.total,
    customer: estimate.deal.customer,
    vehicle: estimate.deal.vehicle,
    estimateLines: estimate.estimateLines,
    mileage: estimate.deal.repairOrders[0]?.mileageIn ?? estimate.deal.vehicle?.mileage ?? null,
    manager: estimate.deal.owner
      ? {
          name: estimate.deal.owner.name,
          phone: estimate.deal.owner.phone,
          email: estimate.deal.owner.email,
        }
      : estimate.preparedBy
        ? { name: estimate.preparedBy.name, phone: "", email: "" }
        : null,
  };

  // Import renderer at runtime — keeps the @react-pdf bundle out of
  // the route's module graph until actually requested. The library
  // is ESM and only works in Node runtime; force that explicitly.
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const buffer = await renderToBuffer(
    EstimatePdfDocument({ estimate: data, requisites, extras }),
  );

  const filename = `smeta-${estimate.number ?? estimate.id.slice(-6).toUpperCase()}.pdf`;
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const runtime = "nodejs";
