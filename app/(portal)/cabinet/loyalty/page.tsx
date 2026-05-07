export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { LOYALTY_TIERS, getNextTier, formatDate } from "@/lib/utils";
import type { LoyaltyTier } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui";

export default async function LoyaltyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const account = await db.loyaltyAccount.findUnique({
    where: { userId: session.id },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!account) {
    return (
      <div>
        <PageHeader eyebrow="Кабинет" title="Программа лояльности" />
        <Card className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">
            Аккаунт лояльности будет создан после первого визита
          </p>
        </Card>
      </div>
    );
  }

  const tier = account.tier as LoyaltyTier;
  const tierInfo = LOYALTY_TIERS[tier];
  const nextTier = getNextTier(tier);
  const transactions = account.transactions as Array<Record<string, unknown>>;

  return (
    <div>
      <PageHeader eyebrow="Кабинет" title="Программа лояльности" />

      {/* Tier card */}
      <Card className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <Badge variant={tier === "AMG_CLUB" ? "amg" : tier === "GOLD" ? "gold" : "silver"}>
            {tierInfo.label}
          </Badge>
          <p className="text-3xl font-bold text-[var(--color-accent)]">
            {account.points} баллов
          </p>
        </div>

        {nextTier && (
          <div>
            <div className="flex justify-between text-xs text-[var(--foreground-muted)] mb-1">
              <span>{tierInfo.label}</span>
              <span>{LOYALTY_TIERS[nextTier.tier].label}</span>
            </div>
            <div
              className="w-full bg-[var(--border)] rounded-full h-2 overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.min(100, (account.points / nextTier.pointsNeeded) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Прогресс до ${LOYALTY_TIERS[nextTier.tier].label}`}
            >
              <div
                className="bg-[var(--color-accent)] h-2 rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, (account.points / nextTier.pointsNeeded) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-[var(--foreground-muted)] mt-1">
              До {LOYALTY_TIERS[nextTier.tier].label}: {nextTier.pointsNeeded - account.points} баллов
            </p>
          </div>
        )}
      </Card>

      {/* Referral */}
      <Card className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Реферальная ссылка</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-3">
          Приглашайте друзей — получайте бонусные баллы за каждый их визит
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={`${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${account.referralCode}`}
            className="input flex-1 text-sm"
            aria-label="Реферальная ссылка"
          />
        </div>
      </Card>

      {/* Transaction history */}
      <div>
        <h2 className="text-lg font-semibold mb-4">История операций</h2>
        {transactions.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-[var(--foreground-muted)]">Операций пока нет</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <Card
                key={tx.id as string}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {tx.description as string || tx.type as string}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {formatDate(tx.createdAt as Date)}
                  </p>
                </div>
                <span
                  className={`font-semibold ${
                    (tx.amount as number) > 0
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-error)]"
                  }`}
                >
                  {(tx.amount as number) > 0 ? "+" : ""}
                  {tx.amount as number}
                </span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
