"use client";

import { useRouter } from "next/navigation";
import { updateRepairOrderStatus } from "@/app/actions/admin";
import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/utils";

const STATUSES = [
  "ESTIMATE",
  "APPROVED",
  "IN_PROGRESS",
  "AWAITING_PARTS",
  "QC",
  "READY",
  "INVOICED",
  "PAID",
  "CLOSED",
  "CANCELLED",
];

export function StatusChanger({
  repairOrderId,
  currentStatus,
}: {
  repairOrderId: string;
  currentStatus: string;
}) {
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await updateRepairOrderStatus(repairOrderId, e.target.value);
    router.refresh();
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      className={`input text-xs py-1 px-2 w-auto status-${currentStatus.toLowerCase()}`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {REPAIR_ORDER_STATUS_LABELS[s] ?? s}
        </option>
      ))}
    </select>
  );
}
