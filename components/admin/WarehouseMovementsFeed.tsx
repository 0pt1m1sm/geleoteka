import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  RECEIPT: "Приёмка",
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
  note: string | null;
  actorUserId: string | null;
  createdAt: Date;
  item: { part: { name: string; article: string } | null } | null;
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
                <th className="p-3">Кто</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-3 whitespace-nowrap text-[var(--foreground-muted)]">{formatDate(m.createdAt)}</td>
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
