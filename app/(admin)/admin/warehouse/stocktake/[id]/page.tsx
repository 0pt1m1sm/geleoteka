export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCountSessionAction } from "@/app/actions/stocktake";
import { PageHeader } from "@/components/ui";
import { StocktakeCountBox } from "@/components/admin/StocktakeCountBox";
import { StocktakeReview } from "@/components/admin/StocktakeReview";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StocktakeSessionPage({ params }: Props) {
  const session = await requireRole(["ADMIN", "MANAGER", "WAREHOUSE_WORKER"]);
  const canPost = session.permissionRole === "ADMIN" || session.permissionRole === "MANAGER";
  const { id } = await params;

  const { session: countSession, variance } = await getCountSessionAction(id);
  if (!countSession) notFound();

  // Enrich lines with part name/article for display.
  const partIds = [...new Set(countSession.lines.map((l) => l.itemId).filter((x): x is string => x != null))];
  const parts =
    partIds.length > 0
      ? ((await db.part.findMany({
          where: { id: { in: partIds } },
          select: { id: true, name: true, article: true },
        })) as Array<{ id: string; name: string; article: string }>)
      : [];
  const partMap = Object.fromEntries(parts.map((p) => [p.id, { name: p.name, article: p.article }]));

  const eyebrow =
    countSession.scope === "ZONE"
      ? `Зона ${countSession.scopeValue ?? ""}`
      : countSession.scope === "LOCATION"
        ? "Ячейки"
        : countSession.scope === "FULL"
          ? "Весь склад"
          : "Позиции";

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Инвентаризация" title={`Пересчёт · ${eyebrow}`} description={`Статус: ${countSession.status}`} backHref="/admin/warehouse/stocktake" backLabel="Инвентаризация" />

      {countSession.status === "OPEN" && (
        <StocktakeCountBox
          sessionId={countSession.id}
          lines={countSession.lines}
          partMap={partMap}
        />
      )}

      {countSession.status === "REVIEW" && (
        <StocktakeReview
          sessionId={countSession.id}
          lines={countSession.lines}
          variance={variance}
          partMap={partMap}
          canPost={canPost}
        />
      )}

      {(countSession.status === "POSTED" || countSession.status === "CANCELLED") && (
        <StocktakeReview
          sessionId={countSession.id}
          lines={countSession.lines}
          variance={variance}
          partMap={partMap}
          canPost={false}
          readOnly
        />
      )}
    </div>
  );
}
