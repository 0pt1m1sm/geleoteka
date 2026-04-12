"use client";

import { useRouter } from "next/navigation";
import { markContributionPaid } from "@/app/actions/supplier-orders";

export function ContributionPaidToggle({
  contributionId,
  isPaid,
}: {
  contributionId: string;
  isPaid: boolean;
}) {
  const router = useRouter();

  async function handleToggle() {
    await markContributionPaid(contributionId, !isPaid);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`badge text-[10px] shrink-0 ${
        isPaid
          ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
          : "bg-[var(--color-warning-bg)] text-[var(--color-warning)] hover:bg-[var(--color-warning-bg)]/80"
      }`}
    >
      {isPaid ? "✓ Оплачено" : "К оплате"}
    </button>
  );
}
