"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateRepairOrderStatusByMaster } from "@/app/actions/master";
import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/utils";

const MASTER_STATUSES = ["IN_PROGRESS", "AWAITING_PARTS", "QC", "READY"] as const;

interface Props {
  repairOrderId: string;
  currentStatus: string;
}

/**
 * Status changer scoped to the master's allowed transitions
 * (IN_PROGRESS / AWAITING_PARTS / QC / READY). Non-master statuses
 * are shown as a read-only badge with a hint that the manager owns
 * them.
 */
export function MasterStatusChanger({
  repairOrderId,
  currentStatus,
}: Props): React.ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const masterCanEdit = (MASTER_STATUSES as readonly string[]).includes(
    currentStatus,
  );

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>): Promise<void> {
    const next = e.target.value;
    if (next === currentStatus) return;
    setError(null);
    setPending(true);
    try {
      const res = await updateRepairOrderStatusByMaster(repairOrderId, next);
      if (!res.ok) {
        setError(res.error);
      } else {
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  if (!masterCanEdit) {
    const label = REPAIR_ORDER_STATUS_LABELS[currentStatus] ?? currentStatus;
    return (
      <div>
        <p className="text-xs text-[var(--foreground-muted)] mb-1">Статус</p>
        <span
          className={`badge text-xs status-${currentStatus.toLowerCase()}`}
        >
          {label}
        </span>
        <p className="text-xs text-[var(--foreground-muted)] mt-2">
          Этот статус задаёт менеджер.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-[var(--foreground-muted)] mb-1">Статус</p>
      <select
        value={currentStatus}
        onChange={handleChange}
        disabled={pending}
        className={`input text-sm w-auto status-${currentStatus.toLowerCase()}`}
      >
        {MASTER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {REPAIR_ORDER_STATUS_LABELS[s] ?? s}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-2 text-xs text-[var(--color-error)]">{error}</p>
      )}
    </div>
  );
}
