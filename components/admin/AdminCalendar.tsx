"use client";

import { useState } from "react";
import { format, addDays, startOfDay, isSameDay, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/utils";

interface CalendarRepairOrder {
  id: string;
  dateTime: string;
  status: string;
  clientName: string;
  clientPhone: string;
  vehicleModel: string;
  masterName: string | null;
  jobs: string[];
}

export function AdminCalendar({
  repairOrders,
}: {
  repairOrders: CalendarRepairOrder[];
}) {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const days = Array.from({ length: 7 }, (_, i) =>
    addDays(startOfDay(selectedDate), i - 3)
  );

  const dayOrders = repairOrders.filter((a) =>
    isSameDay(parseISO(a.dateTime), selectedDate)
  );

  return (
    <div>
      {/* Day selector */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
        {days.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const count = repairOrders.filter((a) =>
            isSameDay(parseISO(a.dateTime), day)
          ).length;
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => setSelectedDate(day)}
              className={`flex flex-col items-center px-4 py-2 rounded-lg shrink-0 min-w-[70px] transition-colors ${
                isSelected
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--card)] border border-[var(--border)] hover:border-[var(--border-hover)]"
              }`}
            >
              <span className="text-[10px] uppercase">
                {format(day, "EEE", { locale: ru })}
              </span>
              <span className="text-lg font-bold">
                {format(day, "d")}
              </span>
              {count > 0 && (
                <span
                  className={`text-[10px] ${
                    isSelected ? "text-white/80" : "text-[var(--color-accent)]"
                  }`}
                >
                  {count} зап.
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="card">
        <h3 className="font-medium mb-4">
          {format(selectedDate, "d MMMM, EEEE", { locale: ru })}
          <span className="text-[var(--foreground-muted)] ml-2">
            ({dayOrders.length} записей)
          </span>
        </h3>

        {dayOrders.length === 0 ? (
          <p className="text-[var(--foreground-muted)] text-sm py-4">
            Нет записей на этот день
          </p>
        ) : (
          <div className="space-y-3">
            {dayOrders
              .sort(
                (a, b) =>
                  new Date(a.dateTime).getTime() -
                  new Date(b.dateTime).getTime()
              )
              .map((ro) => (
                <div
                  key={ro.id}
                  className="flex items-start gap-4 p-3 rounded-lg bg-[var(--background-secondary)]"
                >
                  <div className="text-center shrink-0">
                    <p className="text-lg font-bold">
                      {format(parseISO(ro.dateTime), "HH:mm")}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium truncate">{ro.clientName}</p>
                      <span
                        className={`badge text-[10px] status-${ro.status.toLowerCase()}`}
                      >
                        {REPAIR_ORDER_STATUS_LABELS[ro.status] ?? ro.status}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {ro.vehicleModel}
                      {ro.masterName && ` · ${ro.masterName}`}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ro.jobs.map((s, i) => (
                        <span key={i} className="badge badge-silver text-[10px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
