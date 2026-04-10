"use client";

import { useState } from "react";
import Link from "next/link";
import { useBooking } from "./BookingProvider";
import { createAppointment } from "@/app/actions/booking";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export function BookingConfirmation() {
  const { data, reset } = useBooking();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    appointmentId?: string;
    error?: string;
  } | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    const res = await createAppointment(data);
    setResult(res);
    setSubmitting(false);
    if (res.success) {
      reset();
    }
  }

  if (result?.success) {
    return (
      <div className="card text-center py-12">
        <div className="w-16 h-16 rounded-full bg-[var(--color-success-bg)] mx-auto mb-6 flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-display text-2xl font-bold mb-2">
          Запись подтверждена!
        </h2>
        <p className="text-[var(--foreground-muted)] mb-6">
          Мы отправим SMS с подтверждением. Ждём вас!
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/" className="btn btn-secondary">
            На главную
          </Link>
          <Link href="/cabinet" className="btn btn-primary">
            Личный кабинет
          </Link>
        </div>
      </div>
    );
  }

  const dateFormatted = data.dateTime
    ? format(parseISO(data.dateTime), "d MMMM yyyy, HH:mm", { locale: ru })
    : "—";

  return (
    <div>
      <div className="space-y-4 mb-8">
        <div className="card">
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] mb-2">
            Услуги
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.serviceNames.map((name) => (
              <span key={name} className="badge badge-silver">
                {name}
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] mb-2">
            Автомобиль
          </h3>
          <p className="font-medium">
            Mercedes-Benz {data.model}, {data.year}
          </p>
          {data.vin && (
            <p className="text-sm text-[var(--foreground-muted)] font-mono mt-1">
              VIN: {data.vin}
            </p>
          )}
          {data.mileage && (
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              Пробег: {parseInt(data.mileage).toLocaleString("ru-RU")} км
            </p>
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] mb-2">
            Дата и время
          </h3>
          <p className="font-medium">{dateFormatted}</p>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-[var(--foreground-muted)] mb-2">
            Контактные данные
          </h3>
          <p className="font-medium">{data.name}</p>
          <p className="text-sm text-[var(--foreground-muted)]">{data.phone}</p>
          <p className="text-sm text-[var(--foreground-muted)]">{data.email}</p>
          {data.notes && (
            <p className="text-sm text-[var(--foreground-muted)] mt-2 italic">
              «{data.notes}»
            </p>
          )}
        </div>

        {(data.loanerCar || data.waitAtService) && (
          <div className="card">
            <h3 className="text-sm font-medium text-[var(--foreground-muted)] mb-2">
              Дополнительно
            </h3>
            {data.loanerCar && <p className="text-sm">Подменный автомобиль</p>}
            {data.waitAtService && (
              <p className="text-sm">Ожидание в сервисе</p>
            )}
          </div>
        )}
      </div>

      {result?.error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm mb-6">
          {result.error}
        </div>
      )}

      <div className="flex justify-between">
        <Link href="/booking/step-4" className="btn btn-secondary">
          ← Назад
        </Link>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="btn btn-primary"
        >
          {submitting ? "Отправка..." : "Записаться"}
        </button>
      </div>
    </div>
  );
}
