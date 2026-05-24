import Link from "next/link";
import type { CountSession, StockCountStatus, StockCountScope } from "@/lib/wms/public/stocktake";

const STATUS_LABEL: Record<StockCountStatus, string> = {
  OPEN: "Подсчёт",
  REVIEW: "Проверка",
  POSTED: "Проведена",
  CANCELLED: "Отменена",
};

const SCOPE_LABEL: Record<StockCountScope, string> = {
  ZONE: "Зона",
  LOCATION: "Ячейки",
  FULL: "Весь склад",
  PART: "Позиции",
};

/** Presentational list of count sessions, newest first. */
export function StocktakeSessionList({ sessions }: { sessions: CountSession[] }): React.ReactElement {
  return (
    <section aria-label="Сессии пересчёта" className="card">
      <h2 className="text-lg font-semibold mb-3">Сессии пересчёта</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">Пока нет сессий пересчёта.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/warehouse/stocktake/${s.id}`}
                className="flex items-center justify-between gap-4 py-3 hover:text-[var(--color-accent)]"
              >
                <span className="flex items-center gap-2">
                  <span className="badge">{STATUS_LABEL[s.status]}</span>
                  <span className="text-sm">
                    {SCOPE_LABEL[s.scope]}
                    {s.scopeValue ? <span className="font-mono text-[var(--foreground-muted)]"> · {s.scopeValue}</span> : null}
                  </span>
                </span>
                <span className="text-xs text-[var(--foreground-muted)]">
                  {new Date(s.createdAt).toLocaleString("ru-RU")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
