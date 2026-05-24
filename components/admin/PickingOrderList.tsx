import Link from "next/link";
import type { PickOrderSummary } from "@/app/actions/picking";

/** Presentational list of repair orders that still have un-picked parts. */
export function PickingOrderList({ orders }: { orders: PickOrderSummary[] }): React.ReactElement {
  return (
    <section aria-label="Заказы к отбору" className="card">
      <h2 className="text-lg font-semibold mb-3">Заказы к отбору</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">Нет заказов, ожидающих отбора.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {orders.map((o) => (
            <li key={o.repairOrderId}>
              <Link
                href={`/admin/warehouse/picking/${o.repairOrderId}`}
                className="flex items-center justify-between gap-4 py-3 hover:text-[var(--color-accent)]"
              >
                <span className="flex items-center gap-2">
                  <span className="badge">{o.roNumber ?? "—"}</span>
                  <span className="text-sm">
                    {o.customerName}
                    <span className="font-mono text-[var(--foreground-muted)]"> · {o.vehicle}</span>
                  </span>
                </span>
                <span className="text-xs text-[var(--foreground-muted)]">
                  позиций: {o.openCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
