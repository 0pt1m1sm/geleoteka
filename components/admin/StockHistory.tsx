import { db } from "@/lib/db";
import { availableStock } from "@/lib/wms/public";
import { formatDate } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  RECEIPT: "Приёмка",
  CONSUMPTION: "Расход",
  ADJUSTMENT: "Корректировка",
  RESERVATION: "Резерв",
  RELEASE: "Снятие резерва",
};

interface MovementRow {
  id: string;
  reason: string;
  quantityDelta: number;
  reservedDelta: number;
  sourceType: string;
  sourceId: string | null;
  note: string | null;
  actorUserId: string | null;
  createdAt: Date;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Per-part stock ledger: current counters + the StockMovement history. */
export async function StockHistory({ partId }: { partId: string }): Promise<React.ReactElement> {
  const si = (await db.stockItem.findUnique({
    where: { partId },
    select: { quantity: true, reserved: true },
  })) as { quantity: number; reserved: number } | null;

  const movements = (await db.stockMovement.findMany({
    where: { item: { partId } },
    orderBy: { createdAt: "desc" },
    take: 100,
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
    },
  })) as MovementRow[];

  const actorIds = Array.from(new Set(movements.map((m) => m.actorUserId).filter((x): x is string => !!x)));
  const actors = (await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  const onHand = si?.quantity ?? 0;
  const reserved = si?.reserved ?? 0;
  const available = si ? availableStock(si) : 0;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-3">Движения склада</h2>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "На складе", value: onHand },
          { label: "Зарезервировано", value: reserved },
          { label: "Доступно", value: available },
        ].map((c) => (
          <div key={c.label} className="card text-center py-3">
            <div className="text-xs text-[var(--foreground-muted)]">{c.label}</div>
            <div className="text-xl font-bold tabular-nums text-[var(--color-accent)]">{c.value}</div>
          </div>
        ))}
      </div>

      {movements.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">Движений ещё не было.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--foreground-muted)] border-b border-[var(--border)]">
                <th className="py-2 pr-3">Дата</th>
                <th className="py-2 pr-3">Причина</th>
                <th className="py-2 pr-3 text-right">Остаток</th>
                <th className="py-2 pr-3 text-right">Резерв</th>
                <th className="py-2 pr-3">Источник</th>
                <th className="py-2">Кто</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-[var(--border)]">
                  <td className="py-2 pr-3 whitespace-nowrap text-[var(--foreground-muted)]">{formatDate(m.createdAt)}</td>
                  <td className="py-2 pr-3">{REASON_LABELS[m.reason] ?? m.reason}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.quantityDelta !== 0 ? signed(m.quantityDelta) : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.reservedDelta !== 0 ? signed(m.reservedDelta) : "—"}</td>
                  <td className="py-2 pr-3 text-xs font-mono text-[var(--foreground-muted)]">
                    {m.sourceType}
                    {m.note ? <span className="block not-italic">{m.note}</span> : null}
                  </td>
                  <td className="py-2 text-xs text-[var(--foreground-muted)]">
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
