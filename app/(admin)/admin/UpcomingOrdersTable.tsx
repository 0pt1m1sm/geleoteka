"use client";

import { Badge, DataTable, type DataTableColumn } from "@/components/ui";
import { formatDate, REPAIR_ORDER_STATUS_LABELS } from "@/lib/utils";

export interface UpcomingOrderRow {
  id: string;
  customerName: string;
  customerPhone: string | null;
  vehicleModel: string;
  dateTime: string;
  status: string;
  jobs: string[];
}

const COLUMNS: DataTableColumn<UpcomingOrderRow>[] = [
  {
    key: "customerName",
    header: "Клиент",
    sortable: true,
    render: (row) => (
      <div>
        <p className="font-medium">{row.customerName}</p>
        {row.customerPhone ? (
          <p className="text-xs text-[var(--foreground-muted)]">{row.customerPhone}</p>
        ) : null}
      </div>
    ),
  },
  {
    key: "vehicleModel",
    header: "Авто",
    sortable: true,
  },
  {
    key: "dateTime",
    header: "Дата и время",
    sortable: true,
    render: (row) => formatDate(new Date(row.dateTime)),
  },
  {
    key: "jobs",
    header: "Работы",
    render: (row) => (
      <div className="flex flex-wrap gap-1">
        {row.jobs.map((j, i) => (
          <Badge key={i} variant="silver">
            {j}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    key: "status",
    header: "Статус",
    sortable: true,
    render: (row) => (
      <span className={`badge text-xs status-${row.status.toLowerCase()}`}>
        {REPAIR_ORDER_STATUS_LABELS[row.status] ?? row.status}
      </span>
    ),
  },
];

export function UpcomingOrdersTable({ rows }: { rows: UpcomingOrderRow[] }): React.ReactElement {
  return (
    <DataTable<UpcomingOrderRow>
      columns={COLUMNS}
      data={rows}
      getRowKey={(row) => row.id}
      defaultSortKey="dateTime"
      defaultSortDir="asc"
      ariaLabel="Ближайшие записи"
    />
  );
}
