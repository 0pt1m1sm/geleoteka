import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  RECEIPT: "Приёмка",
  RECEIPT_REVERSAL: "Сторно приёмки",
  CONSUMPTION: "Расход",
  ADJUSTMENT: "Корректировка",
  RESERVATION: "Резерв",
  RELEASE: "Снятие резерва",
};

interface FeedRow {
  id: string;
  reason: string;
  quantityDelta: number;
  reservedDelta: number;
  sourceType: string;
  sourceId: string | null;
  note: string | null;
  actorUserId: string | null;
  createdAt: Date;
  item: { part: { name: string; article: string } | null } | null;
}

/** The source entity id is the segment before the first ":" in sourceId
 *  (e.g. "${shipmentId}:${estimateLineId}" → shipmentId). */
function sourceEntityId(sourceId: string | null): string | null {
  if (!sourceId) return null;
  const i = sourceId.indexOf(":");
  return i === -1 ? sourceId : sourceId.slice(0, i);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Warehouse-wide movements feed: the most recent StockMovements across ALL
 *  parts (the cross-part counterpart of the per-part StockHistory). */
export async function WarehouseMovementsFeed(): Promise<React.ReactElement> {
  const movements = (await db.stockMovement.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      reason: true,
      quantityDelta: true,
      reservedDelta: true,
      sourceType: true,
      sourceId: true,
      note: true,
      actorUserId: true,
      createdAt: true,
      item: { select: { part: { select: { name: true, article: true } } } },
    },
  })) as FeedRow[];

  const actorIds = Array.from(new Set(movements.map((m) => m.actorUserId).filter((x): x is string => !!x)));
  const actors = (await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  // Resolve the originating deal per movement. dealId isn't stored on the
  // movement — it's reached through the source entity (shipment / repair order
  // / estimate line). Supplier receipts and manual adjustments have no deal.
  const shipmentIds = new Set<string>();
  const repairOrderIds = new Set<string>();
  const estimateLineIds = new Set<string>();
  for (const m of movements) {
    const eid = sourceEntityId(m.sourceId);
    if (!eid) continue;
    if (m.sourceType === "PartShipment") shipmentIds.add(eid);
    else if (m.sourceType === "RepairOrder") repairOrderIds.add(eid);
    else if (m.sourceType === "EstimateLine") estimateLineIds.add(eid);
  }
  const [shipments, repairOrders, estimateLines] = (await Promise.all([
    shipmentIds.size
      ? db.partShipment.findMany({ where: { id: { in: [...shipmentIds] } }, select: { id: true, dealId: true } })
      : [],
    repairOrderIds.size
      ? db.repairOrder.findMany({ where: { id: { in: [...repairOrderIds] } }, select: { id: true, dealId: true } })
      : [],
    estimateLineIds.size
      ? db.estimateLine.findMany({
          where: { id: { in: [...estimateLineIds] } },
          select: { id: true, estimate: { select: { dealId: true } } },
        })
      : [],
  ])) as [
    Array<{ id: string; dealId: string }>,
    Array<{ id: string; dealId: string }>,
    Array<{ id: string; estimate: { dealId: string } }>,
  ];

  // Key by `${sourceType}:${entityId}` so ids never collide across types.
  const dealIdByEntity = new Map<string, string>();
  for (const s of shipments) dealIdByEntity.set(`PartShipment:${s.id}`, s.dealId);
  for (const r of repairOrders) dealIdByEntity.set(`RepairOrder:${r.id}`, r.dealId);
  for (const l of estimateLines) dealIdByEntity.set(`EstimateLine:${l.id}`, l.estimate.dealId);

  const deals = (await db.deal.findMany({
    where: { id: { in: Array.from(new Set(dealIdByEntity.values())) } },
    select: { id: true, number: true },
  })) as Array<{ id: string; number: string | null }>;
  const dealNumber = new Map(deals.map((d) => [d.id, d.number]));

  function dealIdFor(m: FeedRow): string | null {
    const eid = sourceEntityId(m.sourceId);
    if (!eid) return null;
    return dealIdByEntity.get(`${m.sourceType}:${eid}`) ?? null;
  }

  return (
    <section aria-label="Движения склада">
      <h2 className="text-lg font-semibold mb-3">Движения склада</h2>
      {movements.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">Движений ещё не было.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--foreground-muted)] border-b border-[var(--border)]">
                <th className="p-3">Дата</th>
                <th className="p-3">Запчасть</th>
                <th className="p-3">Причина</th>
                <th className="p-3 text-right">Остаток</th>
                <th className="p-3 text-right">Резерв</th>
                <th className="p-3">Источник</th>
                <th className="p-3">Сделка</th>
                <th className="p-3">Кто</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-3 whitespace-nowrap text-[var(--foreground-muted)]">
                    {formatDate(m.createdAt, { dateStyle: "medium", timeStyle: "medium" })}
                  </td>
                  <td className="p-3">
                    {m.item?.part ? (
                      <>
                        <span className="block">{m.item.part.name}</span>
                        <span className="block text-xs font-mono text-[var(--foreground-muted)]">{m.item.part.article}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">{REASON_LABELS[m.reason] ?? m.reason}</td>
                  <td className="p-3 text-right tabular-nums">{m.quantityDelta !== 0 ? signed(m.quantityDelta) : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{m.reservedDelta !== 0 ? signed(m.reservedDelta) : "—"}</td>
                  <td className="p-3 text-xs font-mono text-[var(--foreground-muted)]">
                    {m.sourceType}
                    {m.note ? <span className="block">{m.note}</span> : null}
                  </td>
                  <td className="p-3 text-xs font-mono">
                    {(() => {
                      const dealId = dealIdFor(m);
                      if (!dealId) return <span className="text-[var(--foreground-muted)]">—</span>;
                      return (
                        <Link href={`/admin/crm/deals/${dealId}`} className="text-[var(--color-accent)] hover:underline">
                          {dealNumber.get(dealId) ?? dealId.slice(0, 8)}
                        </Link>
                      );
                    })()}
                  </td>
                  <td className="p-3 text-xs text-[var(--foreground-muted)]">
                    {m.actorUserId ? (actorName.get(m.actorUserId) ?? "—") : "система"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
