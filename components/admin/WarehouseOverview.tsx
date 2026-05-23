import Link from "next/link";
import { db } from "@/lib/db";
import { availableStock } from "@/lib/wms/public";
import { incomingByPartIds } from "@/lib/warehouse/incoming";
import { LOW_STOCK_THRESHOLD, TENANT_KEY } from "@/lib/wms-host";
import { Pagination } from "@/components/ui";

const PAGE_SIZE = 25;

interface PartRow {
  id: string;
  name: string;
  article: string;
  stockItem: { id: string; quantity: number; reserved: number; barcode: string | null } | null;
}

/** Cross-part stock overview: name/article/barcode + on-hand/reserved/available,
 *  placement summary (placed/unplaced + reconcile flag), server-side search
 *  (name|article|barcode), location filter (?loc=), pagination, low-stock highlight. */
export async function WarehouseOverview({
  q,
  page,
  loc,
}: {
  q?: string;
  page: number;
  loc?: string;
}): Promise<React.ReactElement> {
  const query = (q ?? "").trim();
  const location = (loc ?? "").trim().toUpperCase();
  const where = {
    isActive: true,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { article: { contains: query, mode: "insensitive" as const } },
            { stockItem: { is: { barcode: { contains: query, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
    ...(location
      ? { stockItem: { is: { bins: { some: { location, tenantKey: TENANT_KEY, quantity: { gt: 0 } } } } } }
      : {}),
  };

  const total = (await db.part.count({ where })) as number;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, totalPages);

  const parts = (await db.part.findMany({
    where,
    select: {
      id: true,
      name: true,
      article: true,
      stockItem: { select: { id: true, quantity: true, reserved: true, barcode: true } },
    },
    orderBy: { name: "asc" },
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  })) as PartRow[];

  // Single batch query for placed totals across the visible page (no N+1).
  // groupBy is cast through a loose function type — the generated (@ts-nocheck)
  // client's strict GroupByArgs overload leaks its result type into the arg
  // constraint, so the inline call otherwise fails to type-check.
  const stockItemIds = parts.map((p) => p.stockItem?.id).filter((x): x is string => !!x);
  const groupBins = db.stockBin.groupBy as unknown as (
    args: unknown,
  ) => Promise<Array<{ itemId: string; _sum: { quantity: number | null } }>>;
  const placedRows =
    stockItemIds.length > 0
      ? await groupBins({
          by: ["itemId"],
          where: { itemId: { in: stockItemIds }, tenantKey: TENANT_KEY },
          _sum: { quantity: true },
        })
      : [];
  const placedByItem = new Map(placedRows.map((r) => [r.itemId, r._sum.quantity ?? 0]));

  // Incoming (ожидается): units still owed on this page's parts across open
  // supplier orders. Single batch groupBy keyed by partId — no N+1.
  const incomingByPart = await incomingByPartIds(db, parts.map((p) => p.id));

  const buildHref = (p: number): string => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (location) params.set("loc", location);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/warehouse?${qs}` : "/admin/warehouse";
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Остатки</h2>
        <form method="get" action="/admin/warehouse" className="flex gap-2 w-full sm:w-auto">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Название, артикул или штрихкод"
            aria-label="Поиск по складу"
            className="input flex-1 sm:w-64"
          />
          <button type="submit" className="btn btn-secondary shrink-0">Найти</button>
        </form>
      </div>

      {parts.length === 0 ? (
        <div className="card text-center py-12 text-[var(--foreground-muted)]">
          {query ? "Ничего не найдено" : "Запчастей пока нет"}
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--foreground-muted)]">
                <th className="p-3 font-medium">Название</th>
                <th className="p-3 font-medium">Артикул</th>
                <th className="p-3 font-medium">Штрихкод</th>
                <th className="p-3 font-medium text-right">На складе</th>
                <th className="p-3 font-medium text-right">Резерв</th>
                <th className="p-3 font-medium text-right">Доступно</th>
                <th className="p-3 font-medium text-right">Ожидается</th>
                <th className="p-3 font-medium text-right">Размещение</th>
                <th className="p-3 font-medium text-right">Этикетка</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => {
                const si = p.stockItem;
                const onHand = si?.quantity ?? 0;
                const reserved = si?.reserved ?? 0;
                const available = si ? availableStock(si) : 0;
                const low = available <= LOW_STOCK_THRESHOLD;
                const placed = si ? (placedByItem.get(si.id) ?? 0) : 0;
                const unplaced = Math.max(0, onHand - placed);
                const reconcile = placed > onHand;
                const incoming = incomingByPart.get(p.id) ?? 0;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-[var(--border)] last:border-0 ${
                      low ? "bg-[var(--color-error-bg)]" : ""
                    }`}
                  >
                    <td className="p-3">{p.name}</td>
                    <td className="p-3 font-mono text-xs">{p.article}</td>
                    <td className="p-3 font-mono text-xs">{si?.barcode ?? "—"}</td>
                    <td className="p-3 text-right">{onHand}</td>
                    <td className="p-3 text-right">{reserved}</td>
                    <td className={`p-3 text-right font-medium ${low ? "text-[var(--color-error)]" : ""}`}>
                      {available}
                    </td>
                    <td className="p-3 text-right">
                      {incoming > 0 ? (
                        <span className="text-[var(--color-info)]">+{incoming}</span>
                      ) : (
                        <span className="text-[var(--foreground-muted)]">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-xs">
                      <span className="text-[var(--foreground-muted)]">{placed} / {unplaced}</span>
                      {reconcile && (
                        <span className="ml-2 badge bg-[var(--color-error-bg)] text-[var(--color-error)]">сверка</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-xs">
                      <Link
                        href={`/admin/warehouse/labels?part=${p.id}`}
                        className="text-[var(--color-accent)] hover:underline"
                      >
                        этикетка
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination currentPage={current} totalPages={totalPages} buildHref={buildHref} ariaLabel="Страницы остатков" />
    </div>
  );
}
