export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/wms-host";
import { PageHeader } from "@/components/ui";
import { ReportsNav } from "@/components/admin/ReportsNav";
import { WarehouseSwitcher } from "@/components/admin/WarehouseSwitcher";
import { listWarehouses, resolveWarehouseId } from "@/app/actions/warehouses";
import { formatDateTime } from "@/lib/utils";
import { MOVEMENT_REASON_LABELS } from "@/lib/warehouse/movement-csv";

// NOT compile-enforced (as-const allow-list) — keep in sync with StockMovementReason.
const REASONS = ["RECEIPT", "RECEIPT_REVERSAL", "CONSUMPTION", "ADJUSTMENT", "RESERVATION", "RELEASE"] as const;

interface Props {
  searchParams: Promise<{ from?: string; to?: string; reason?: string; wh?: string }>;
}

interface PreviewRow {
  id: string;
  createdAt: Date;
  reason: string;
  quantityDelta: number;
  reservedDelta: number;
  item: { part: { name: string; article: string } | null } | null;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export default async function MovementsReportPage({ searchParams }: Props) {
  await requireRole(["ADMIN", "MANAGER"]);
  const sp = await searchParams;
  const from = (sp.from ?? "").trim();
  const to = (sp.to ?? "").trim();
  const reason = (sp.reason ?? "").trim();
  const warehouses = await listWarehouses();
  const warehouseId = await resolveWarehouseId(sp.wh, warehouses);

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) createdAt.lte = new Date(`${to}T23:59:59.999Z`);
  const where = {
    tenantKey: TENANT_KEY,
    warehouseId,
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(reason && (REASONS as readonly string[]).includes(reason) ? { reason: reason as (typeof REASONS)[number] } : {}),
  };

  const preview = (await db.stockMovement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      reason: true,
      quantityDelta: true,
      reservedDelta: true,
      item: { select: { part: { select: { name: true, article: true } } } },
    },
  })) as PreviewRow[];

  const exportParams = new URLSearchParams();
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  if (reason) exportParams.set("reason", reason);
  exportParams.set("wh", warehouseId);
  const exportHref = `/api/admin/warehouse/movements/export${exportParams.toString() ? `?${exportParams}` : ""}`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Запчасти · Отчёты"
        title="Движения склада"
        description="Фильтр и экспорт журнала движений в CSV"
        backHref="/admin/warehouse"
        backLabel="Склад"
        actions={<WarehouseSwitcher warehouses={warehouses} current={warehouseId} />}
      />

      <ReportsNav active="movements" wh={warehouseId} />

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <input type="hidden" name="wh" value={warehouseId} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--foreground-muted)]">С даты</span>
          <input type="date" name="from" defaultValue={from} className="input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--foreground-muted)]">По дату</span>
          <input type="date" name="to" defaultValue={to} className="input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--foreground-muted)]">Причина</span>
          <select name="reason" defaultValue={reason} className="input">
            <option value="">Все</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {MOVEMENT_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary">Применить</button>
        <a href={exportHref} className="btn btn-primary">Экспорт CSV</a>
      </form>

      {preview.length === 0 ? (
        <div className="card text-center py-12 text-[var(--foreground-muted)]">Нет движений по фильтру</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--foreground-muted)]">
                <th className="p-3 font-medium">Дата</th>
                <th className="p-3 font-medium">Запчасть</th>
                <th className="p-3 font-medium">Причина</th>
                <th className="p-3 font-medium text-right">Остаток Δ</th>
                <th className="p-3 font-medium text-right">Резерв Δ</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((m) => (
                <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-3 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                  <td className="p-3">
                    {m.item?.part?.name ?? "—"}
                    {m.item?.part?.article ? (
                      <span className="font-mono text-xs text-[var(--foreground-muted)]"> · {m.item.part.article}</span>
                    ) : null}
                  </td>
                  <td className="p-3">{MOVEMENT_REASON_LABELS[m.reason] ?? m.reason}</td>
                  <td className="p-3 text-right">{m.quantityDelta !== 0 ? signed(m.quantityDelta) : "—"}</td>
                  <td className="p-3 text-right">{m.reservedDelta !== 0 ? signed(m.reservedDelta) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-3 text-xs text-[var(--foreground-muted)]">Показаны последние 50; экспорт включает все записи по фильтру (до 50000).</p>
        </div>
      )}
    </div>
  );
}
