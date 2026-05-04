"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useBooking } from "./BookingProvider";
import { format, addDays, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";

interface Slot {
  time: string;
  available: boolean;
}

const WORK_HOURS = [
  "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00",
  "17:00", "18:00", "19:00",
];

export function CalendarSlotPicker() {
  const { data, update } = useBooking();
  const [selectedDate, setSelectedDate] = useState<Date>(
    data.dateTime ? new Date(data.dateTime) : addDays(new Date(), 1)
  );
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedTime = data.dateTime
    ? format(new Date(data.dateTime), "HH:mm")
    : "";

  const fetchSlots = useCallback(async (date: Date) => {
    setLoading(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const res = await fetch(`/api/slots?date=${dateStr}`);
      if (res.ok) {
        const json = await res.json();
        setSlots(json.slots);
      } else {
        setSlots(WORK_HOURS.map((t) => ({ time: t, available: true })));
      }
    } catch {
      setSlots(WORK_HOURS.map((t) => ({ time: t, available: true })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlots(selectedDate);
  }, [selectedDate, fetchSlots]);

  const days = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i + 1));

  function selectSlot(time: string) {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    update({ dateTime: `${dateStr}T${time}:00` });
  }

  return (
    <div>
      {/* Date picker — horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 -mx-2 px-2">
        {days.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const dayName = format(day, "EEE", { locale: ru });
          const dayNum = format(day, "d");
          const monthName = format(day, "MMM", { locale: ru });
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => setSelectedDate(day)}
              className={`flex flex-col items-center px-3 py-2 rounded-lg shrink-0 min-w-[60px] transition-colors ${
                isSelected
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--card)] border border-[var(--border)] hover:border-[var(--border-hover)]"
              }`}
            >
              <span className="text-[10px] uppercase">{dayName}</span>
              <span className="text-lg font-bold">{dayNum}</span>
              <span className="text-[10px]">{monthName}</span>
            </button>
          );
        })}
      </div>

      {/* Time slots */}
      <div className="card mb-8">
        <h3 className="font-medium mb-4">
          {format(selectedDate, "d MMMM, EEEE", { locale: ru })}
        </h3>
        {loading ? (
          <p className="text-[var(--foreground-muted)] text-sm">Загрузка...</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {slots.map((slot) => (
              <button
                key={slot.time}
                type="button"
                disabled={!slot.available}
                onClick={() => selectSlot(slot.time)}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  selectedTime === slot.time
                    ? "bg-[var(--color-accent)] text-white"
                    : slot.available
                      ? "bg-[var(--background-secondary)] hover:bg-[var(--card-hover)] border border-[var(--border)]"
                      : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] opacity-40 cursor-not-allowed line-through"
                }`}
              >
                {slot.time}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Link href="/booking" className="btn btn-secondary">
          ← Назад
        </Link>
        {data.dateTime ? (
          <Link href="/booking/step-3" className="btn btn-primary">
            Далее →
          </Link>
        ) : (
          <button type="button" disabled className="btn btn-primary opacity-50 cursor-not-allowed">
            Выберите время
          </button>
        )}
      </div>
    </div>
  );
}
