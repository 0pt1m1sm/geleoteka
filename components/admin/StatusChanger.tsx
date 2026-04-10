"use client";

import { useRouter } from "next/navigation";
import { updateAppointmentStatus } from "@/app/actions/admin";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/utils";

const STATUSES = ["BOOKED", "ACCEPTED", "DIAGNOSIS", "IN_REPAIR", "QC", "READY", "COMPLETED", "CANCELLED"];

export function StatusChanger({ appointmentId, currentStatus }: { appointmentId: string; currentStatus: string }) {
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await updateAppointmentStatus(appointmentId, e.target.value);
    router.refresh();
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      className={`input text-xs py-1 px-2 w-auto status-${currentStatus.toLowerCase()}`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>{APPOINTMENT_STATUS_LABELS[s] ?? s}</option>
      ))}
    </select>
  );
}
