export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import { ReportsNav } from "@/components/admin/ReportsNav";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";
import { getValuationReport } from "@/app/actions/warehouse-reports";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";

export default async function ValuationReportPage({ searchParams }: { searchParams: Promise<{ wh?: string }> }) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { wh } = await searchParams;
  const warehouses = await listWarehouses();
  const warehouseId = await resolveWarehouseId(wh, warehouses);
  const { rows, totalValue, noCostCount } = await getValuationReport(warehouseId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Запчасти · Отчёты"
        title="Оценка запасов"
        description="Стоимость остатков по последней цене закупки"
        backHref="/admin/warehouse"
        backLabel="Склад"
        actions={<WarehouseSwitcher warehouses={warehouses} current={warehouseId} />}
      />

      <ReportsNav active="valuation" wh={warehouseId} />

      <section aria-label="Оценка запасов" className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="card px-4 py-3">
            <div className="text-xs text-[var(--foreground-muted)]">Итого по складу</div>
            <div className="text-xl font-semibold">{formatPrice(totalValue)}</div>
          </div>
          {noCostCount > 0 && (
            <div className="text-sm text-[var(--foreground-muted)]">
              без себестоимости: <span className="text-[var(--color-error)]">{noCostCount}</span>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="card text-center py-12 text-[var(--foreground-muted)]">Нет складских позиций</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--foreground-muted)]">
                  <th className="p-3 font-medium">Название</th>
                  <th className="p-3 font-medium">Артикул</th>
                  <th className="p-3 font-medium text-right">На складе</th>
                  <th className="p-3 font-medium text-right">Себестоимость</th>
                  <th className="p-3 font-medium text-right">Стоимость</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.partId} className="border-b border-[var(--border)] last:border-0">
                    <td className="p-3">{r.name}</td>
                    <td className="p-3 font-mono text-xs">{r.article}</td>
                    <td className="p-3 text-right">{r.onHand}</td>
                    <td className="p-3 text-right">
                      {r.unitCost !== null ? (
                        formatPrice(r.unitCost)
                      ) : (
                        <span className="text-[var(--foreground-muted)]">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {r.lineValue !== null ? (
                        formatPrice(r.lineValue)
                      ) : (
                        <span className="text-[var(--foreground-muted)]">—</span>
                      )}
                    </td>
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
