"use client";

import { useQuery } from "@tanstack/react-query";
import { APPOINTMENT_STATUS_LABELS, formatDateTime } from "@/lib/utils";

interface Appointment {
  id: string;
  status: string;
  dateTime: string;
  carModel: string;
  services: string[];
}

const STATUS_ORDER = [
  "BOOKED",
  "ACCEPTED",
  "DIAGNOSIS",
  "IN_REPAIR",
  "QC",
  "READY",
];

async function fetchStatus(id: string): Promise<{ status: string }> {
  const res = await fetch(`/api/appointments/${id}/status`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

function StatusTimeline({ current }: { current: string }) {
  const currentIdx = STATUS_ORDER.indexOf(current);

  return (
    <div className="flex items-center gap-1 mt-4">
      {STATUS_ORDER.map((status, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <div key={status} className="flex items-center gap-1 flex-1">
            <div
              className={`w-full h-2 rounded-full transition-colors ${
                isDone
                  ? "bg-[var(--color-success)]"
                  : isActive
                    ? "bg-[var(--color-accent)]"
                    : "bg-[var(--border)]"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

function AppointmentTracker({ appointment }: { appointment: Appointment }) {
  const { data } = useQuery({
    queryKey: ["appointment-status", appointment.id],
    queryFn: () => fetchStatus(appointment.id),
    refetchInterval: 30_000,
    initialData: { status: appointment.status },
  });

  const currentStatus = data?.status ?? appointment.status;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">Mercedes-Benz {appointment.carModel}</p>
          <p className="text-sm text-[var(--foreground-muted)]">
            {formatDateTime(appointment.dateTime)}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {appointment.services.map((name) => (
              <span key={name} className="badge badge-silver text-xs">
                {name}
              </span>
            ))}
          </div>
        </div>
        <span
          className={`badge text-xs shrink-0 status-${currentStatus.toLowerCase()}`}
        >
          {APPOINTMENT_STATUS_LABELS[currentStatus] ?? currentStatus}
        </span>
      </div>
      <StatusTimeline current={currentStatus} />
      <p className="text-xs text-[var(--foreground-muted)] mt-2">
        Обновляется каждые 30 секунд
      </p>
    </div>
  );
}

export function StatusBoard({ initial }: { initial: Appointment[] }) {
  return (
    <div className="space-y-4">
      {initial.map((apt) => (
        <AppointmentTracker key={apt.id} appointment={apt} />
      ))}
    </div>
  );
}
