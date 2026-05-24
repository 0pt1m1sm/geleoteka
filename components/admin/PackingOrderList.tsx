import Link from "next/link";
import type { PackOrderSummary } from "@/app/actions/packing";

/** Presentational list of customer part-orders awaiting fulfillment (PROCESSING). */
export function PackingOrderList({ orders }: { orders: PackOrderSummary[] }): React.ReactElement {
  return (
    <section aria-label="Заказы к упаковке" className="card">
      <h2 className="text-lg font-semibold mb-3">Заказы к упаковке</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">Нет заказов, ожидающих упаковки.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {orders.map((o) => (
            <li key={o.orderId}>
              <Link
                href={`/admin/warehouse/packing/${o.orderId}`}
                className="flex items-center justify-between gap-4 py-3 hover:text-[var(--color-accent)]"
              >
                <span className="flex items-center gap-2">
                  <span className="badge">{o.orderNumber ?? o.orderId.slice(0, 8)}</span>
                  <span className="text-sm">{o.contactName}</span>
                </span>
                <span className="text-xs text-[var(--foreground-muted)]">
                  упаковано: {o.packed}/{o.required}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
