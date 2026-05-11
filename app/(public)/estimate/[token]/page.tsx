export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { CustomerEstimateView } from "@/components/portal/CustomerEstimateView";

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
}

/**
 * Public estimate review by claim-token. Linked from SMS / email
 * sent to a guest who booked without an account. Token matches
 * `Deal.claimToken` (one-shot secret issued at booking time and
 * cleared after the guest claims the account); while it's present,
 * the guest can review every estimate attached to the deal and
 * accept/decline without logging in.
 */
export default async function GuestEstimatePage({ params }: Props) {
  const { token } = await params;

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
  const primary = ordered[0];

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
        <>
          <CustomerEstimateView
            estimate={{
              ...primary,
              vehicle: deal.vehicle,
            }}
            claimToken={token}
            printHref={`/api/estimates/${primary.id}/pdf?token=${token}`}
          />

          {ordered.length > 1 ? (
            <div className="mt-8">
              <h2 className="text-sm uppercase tracking-wider text-[var(--foreground-muted)] mb-3">
                Другие версии сметы
              </h2>
              <ul className="space-y-2 text-sm">
                {ordered.slice(1).map((e) => (
                  <li key={e.id} className="text-[var(--foreground-muted)]">
                    {e.number ?? "Версия"} · {e.stage}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
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
