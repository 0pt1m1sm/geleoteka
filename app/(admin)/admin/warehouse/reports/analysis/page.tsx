export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ReportsNav } from "@/components/admin/ReportsNav";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";
import { formatDate } from "@/lib/utils";
import { getStockAnalysis } from "@/app/actions/warehouse-reports";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";

const WINDOWS = [30, 90, 180] as const;
const CLASS_STYLE: Record<string, string> = {
  A: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  B: "bg-[var(--color-info-bg)] text-[var(--color-info)]",
  C: "bg-[var(--color-error-bg)] text-[var(--color-error)]",
};

interface Props {
  searchParams: Promise<{ windowDays?: string; wh?: string }>;
}

export default async function StockAnalysisPage({ searchParams }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);
  const sp = await searchParams;
  const warehouses = await listWarehouses();
  const warehouseId = await resolveWarehouseId(sp.wh, warehouses);
  const { windowDays, deadStock, abc } = await getStockAnalysis(parseInt(sp.windowDays ?? "90", 10) || 90, warehouseId);
  const whParam = sp.wh ? `&wh=${encodeURIComponent(sp.wh)}` : "";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Запчасти · Отчёты"
        title="Анализ запасов"
        description="Неликвиды и ABC-классификация по расходу"
        backHref="/admin/warehouse"
        backLabel="Склад"
        actions={<WarehouseSwitcher warehouses={warehouses} current={warehouseId} />}
      />

      <ReportsNav active="analysis" wh={warehouseId} />

      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--foreground-muted)]">Окно:</span>
        {WINDOWS.map((w) => (
          <Link
            key={w}
            href={`/admin/warehouse/reports/analysis?windowDays=${w}${whParam}`}
            className={`badge ${w === windowDays ? "bg-[var(--color-accent)] text-black" : ""}`}
          >
            {w} дн.
          </Link>
        ))}
      </div>

      <section aria-label="Неликвиды" className="space-y-3">
        <h2 className="text-lg font-semibold">Неликвиды (нет расхода за {windowDays} дн.)</h2>
        {deadStock.length === 0 ? (
          <div className="card text-center py-8 text-[var(--foreground-muted)]">Нет неликвидов за выбранный период</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--foreground-muted)]">
                  <th className="p-3 font-medium">Название</th>
                  <th className="p-3 font-medium">Артикул</th>
                  <th className="p-3 font-medium text-right">На складе</th>
                  <th className="p-3 font-medium text-right">Последний расход</th>
                </tr>
              </thead>
              <tbody>
                {deadStock.map((r) => (
                  <tr key={r.partId} className="border-b border-[var(--border)] last:border-0">
                    <td className="p-3">{r.name}</td>
                    <td className="p-3 font-mono text-xs">{r.article}</td>
                    <td className="p-3 text-right">{r.onHand}</td>
                    <td className="p-3 text-right text-[var(--foreground-muted)]">
                      {r.lastConsumedAt ? formatDate(r.lastConsumedAt, { dateStyle: "short" }) : "никогда"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="ABC-анализ" className="space-y-3">
        <h2 className="text-lg font-semibold">ABC-анализ (по расходу за {windowDays} дн.)</h2>
        {abc.length === 0 ? (
          <div className="card text-center py-8 text-[var(--foreground-muted)]">Нет расхода за выбранный период</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--foreground-muted)]">
                  <th className="p-3 font-medium">Класс</th>
                  <th className="p-3 font-medium">Название</th>
                  <th className="p-3 font-medium">Артикул</th>
                  <th className="p-3 font-medium text-right">Расход</th>
                  <th className="p-3 font-medium text-right">Накопл. %</th>
                </tr>
              </thead>
              <tbody>
                {abc.map((r) => (
                  <tr key={r.partId} className="border-b border-[var(--border)] last:border-0">
                    <td className="p-3">
                      <span className={`badge ${CLASS_STYLE[r.abcClass] ?? ""}`}>{r.abcClass}</span>
                    </td>
                    <td className="p-3">{r.name}</td>
                    <td className="p-3 font-mono text-xs">{r.article}</td>
                    <td className="p-3 text-right">{r.consumedQty}</td>
                    <td className="p-3 text-right text-[var(--foreground-muted)]">{r.cumulativeShare.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
