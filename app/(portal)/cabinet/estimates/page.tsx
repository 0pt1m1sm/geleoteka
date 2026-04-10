export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { EstimateReview } from "@/components/portal/EstimateReview";

export default async function EstimatesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const estimates = await db.estimate.findMany({
    where: {
      appointment: { userId: session.id },
      status: "PENDING",
    },
    include: {
      items: true,
      appointment: {
        include: {
          car: { select: { model: true } },
          services: { include: { service: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const serialized = estimates.map((e: Record<string, unknown>) => ({
    id: e.id as string,
    total: e.total as number,
    status: e.status as string,
    carModel: ((e.appointment as Record<string, unknown>).car as Record<string, string>).model,
    items: (e.items as Array<Record<string, unknown>>).map((item) => ({
      id: item.id as string,
      type: item.type as string,
      description: item.description as string,
      quantity: item.quantity as number,
      unitPrice: item.unitPrice as number,
      approved: item.approved as boolean | null,
    })),
  }));

  return (
    <div>
      <h1 className="text-display text-2xl font-bold mb-6">Сметы</h1>
      {serialized.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)]">
            Нет смет на согласование
          </p>
        </div>
      ) : (
        <EstimateReview estimates={serialized} />
      )}
    </div>
  );
}
