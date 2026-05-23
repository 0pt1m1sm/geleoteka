export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { CustomerEstimateView } from "@/components/portal/CustomerEstimateView";
import { EstimateRevisionBanner } from "@/components/crm/EstimateRevisionBanner";
import { EstimateLineageBreadcrumb } from "@/components/crm/EstimateLineageBreadcrumb";
import { getEstimateChain } from "@/lib/crm/estimate-chain";

interface DealMin {
  id: string;
  customerUserId: string;
  claimToken: string | null;
  vehicle: { make: string; model: string; year: number } | null;
  estimates: Array<{
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
    tax: number;
    taxRate: number;
    total: number;
    createdAt: Date;
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

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ id?: string }>;
}

/**
 * Public estimate review by claim-token. Linked from SMS / email
 * sent to a guest who booked without an account. Token matches
 * `Deal.claimToken` (one-shot secret issued at booking time and
 * cleared after the guest claims the account); while it's present,
 * the guest can review every estimate attached to the deal and
 * accept/decline without logging in.
 */
export default async function GuestEstimatePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { id: requestedId } = await searchParams;

  const deal = (await db.deal.findFirst({
    where: { claimToken: token },
    select: {
      id: true,
      customerUserId: true,
      claimToken: true,
      vehicle: { select: { make: true, model: true, year: true } },
      estimates: {
        orderBy: { createdAt: "desc" },
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
          tax: true,
          taxRate: true,
          total: true,
          createdAt: true,
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
  })) as DealMin | null;

  if (!deal) notFound();

  // Surface the latest non-superseded estimate first; show others below.
  const ordered = deal.estimates.slice().sort((a, b) => {
    const score = (s: string) =>
      s === "SENT" ? 0 : s === "DRAFT" ? 1 : s === "APPROVED" ? 2 : 3;
    return score(a.stage) - score(b.stage);
  });
  // Token grants access to every estimate on the deal — when `?id=` is
  // present and resolves to one of them, render that estimate as primary.
  // Otherwise fall back to the natural primary (latest non-superseded).
  const requested = requestedId
    ? ordered.find((e) => e.id === requestedId)
    : undefined;
  const primary = requested ?? ordered[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Geleoteka"
        title="Смета на согласование"
        description="Просмотрите состав работ и подтвердите согласие или отправьте отказ — мы свяжемся с вами."
      />

      {!primary ? (
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">
            Сметы по этой ссылке ещё не подготовлены. Мы свяжемся с вами,
            когда смета будет готова.
          </p>
        </Card>
      ) : (
        <PrimaryEstimateBlock primary={primary} deal={deal} token={token} />
      )}

      <p className="mt-8 text-xs text-[var(--foreground-muted)] text-center">
        Уже зарегистрированы?{" "}
        <Link href="/login" className="text-[var(--color-accent)] hover:underline">
          Войти в личный кабинет
        </Link>
      </p>
    </div>
  );
}

type PrimaryEstimate = DealMin["estimates"][number];

interface PrimaryBlockProps {
  primary: PrimaryEstimate;
  deal: DealMin;
  token: string;
}

/**
 * The token page renders one estimate at a time. The active estimate is
 * either the natural primary (latest non-superseded) or whatever
 * `?id=<estimateId>` selects. Banner/breadcrumb links pass `?id=` so
 * clicking a revision actually loads that revision's body and PDF link.
 */
async function PrimaryEstimateBlock({
  primary,
  deal,
  token,
}: PrimaryBlockProps): Promise<React.ReactElement> {
  const chain = await getEstimateChain(primary.id);
  const supersededTarget = primary.stage === "SUPERSEDED" ? chain.activeRevision : null;
  const tokenHref = (id: string): string => `/estimate/${token}?id=${id}`;

  return (
    <>
      <EstimateRevisionBanner
        mode="revision"
        target={chain.parent}
        href={chain.parent ? tokenHref(chain.parent.id) : ""}
      />
      <EstimateRevisionBanner
        mode="superseded"
        target={supersededTarget}
        href={supersededTarget ? tokenHref(supersededTarget.id) : ""}
      />
      <EstimateLineageBreadcrumb
        chain={chain.chain}
        currentId={primary.id}
        hrefBuilder={tokenHref}
      />

      <CustomerEstimateView
        estimate={{
          ...primary,
          vehicle: deal.vehicle,
        }}
        claimToken={token}
        printHref={`/api/estimates/${primary.id}/pdf?token=${token}`}
      />
    </>
  );
}
