"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useBooking } from "./BookingProvider";
import { createRepairOrder } from "@/app/actions/booking";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

interface DefaultContact {
  name?: string;
  phone?: string;
  email?: string;
}

/**
 * Step 3 of the booking wizard — combined Contact form + Summary card + Submit.
 * Replaces the previous separate `step-4` (Contact) and `step-5` (Confirmation) pages.
 *
 * - Top: Contact form (Name + Phone + Email all required, Notes + checkboxes optional)
 * - Bottom: Summary card with services + vehicle + datetime, each row links back to the relevant step
 * - Single "Записаться" primary button. On success: confirmation state with "На главную" / "Личный кабинет" links
 *
 * `defaultContact` is provided by the page server-side from getSession() for
 * logged-in users. We seed BookingProvider's name/phone/email ONCE on mount,
 * and only when all three are still empty — never overwrite user input.
 */
export function Step3ContactConfirm({
  defaultContact,
}: { defaultContact?: DefaultContact } = {}): React.ReactElement {
  const { data, update, reset } = useBooking();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    repairOrderId?: string;
    error?: string;
  } | null>(null);

  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (!defaultContact) return;
    if (data.name.trim() || data.phone.trim() || data.email.trim()) return;
    prefilledRef.current = true;
    update({
      name: defaultContact.name ?? "",
      phone: defaultContact.phone ?? "",
      email: defaultContact.email ?? "",
    });
  }, [defaultContact, data.name, data.phone, data.email, update]);

  const canSubmit =
    data.name.trim() !== "" &&
    data.phone.trim() !== "" &&
    data.email.trim() !== "" &&
    data.serviceIds.length > 0 &&
    data.model.trim() !== "" &&
    data.year.trim() !== "" &&
    data.dateTime !== "";

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    const res = await createRepairOrder(data);
    setResult(res);
    setSubmitting(false);
    if (res.success) reset();
  }

  if (result?.success) {
    return (
      <div className="card text-center py-12">
        <div className="w-16 h-16 rounded-full bg-[var(--color-success-bg)] mx-auto mb-6 flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-display text-2xl font-bold mb-2">Запись подтверждена!</h2>
        <p className="text-foreground-muted mb-6">
          Мы отправим SMS с подтверждением. Ждём вас!
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/" className="btn btn-secondary">На главную</Link>
          <Link href="/cabinet" className="btn btn-primary">Личный кабинет</Link>
        </div>
      </div>
    );
  }

  const dateFormatted = data.dateTime
    ? format(parseISO(data.dateTime), "d MMMM yyyy, HH:mm", { locale: ru })
    : "—";

  return (
    <div className="space-y-6">
      {/* Contact form */}
      <div className="card space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Ваши контакты</h2>
          {defaultContact?.email && (
            <p className="text-xs text-foreground-muted">Заполнено из профиля</p>
          )}
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">Имя *</label>
          <input
            id="name"
            type="text"
            value={data.name}
            onChange={(e) => update({ name: e.target.value })}
            className="input"
            placeholder="Иван Иванов"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон *</label>
          <input
            id="phone"
            type="tel"
            value={data.phone}
            onChange={(e) => update({ phone: e.target.value })}
            className="input"
            placeholder="+7 (999) 123-45-67"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">Email *</label>
          <input
            id="email"
            type="email"
            value={data.email}
            onChange={(e) => update({ email: e.target.value })}
            className="input"
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium mb-2">Примечания</label>
          <textarea
            id="notes"
            value={data.notes}
            onChange={(e) => update({ notes: e.target.value })}
            className="input min-h-[80px] resize-y"
            placeholder="Опишите проблему или пожелания..."
          />
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.loanerCar}
              onChange={(e) => update({ loanerCar: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--border)] accent-[var(--color-accent)]"
            />
            <span className="text-sm">Нужен подменный автомобиль</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.waitAtService}
              onChange={(e) => update({ waitAtService: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--border)] accent-[var(--color-accent)]"
            />
            <span className="text-sm">Буду ожидать в сервисе</span>
          </label>
        </div>
      </div>

      {/* Summary card */}
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Ваша запись</h2>

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs text-foreground-muted mb-1">Услуги</p>
            <div className="flex flex-wrap gap-1.5">
              {data.serviceNames.map((name) => (
                <span key={name} className="badge badge-silver text-xs">{name}</span>
              ))}
            </div>
          </div>
          <Link href="/booking" className="text-xs text-accent hover:text-accent-hover transition-colors shrink-0">
            ← Изменить
          </Link>
        </div>

        <div className="flex items-start justify-between gap-3 pt-3 border-t border-[var(--border)]">
          <div className="flex-1">
            <p className="text-xs text-foreground-muted mb-1">Автомобиль</p>
            <p className="text-sm font-medium">Mercedes-Benz {data.model}, {data.year}</p>
            {data.vin && <p className="text-xs text-foreground-muted font-mono mt-0.5">VIN: {data.vin}</p>}
          </div>
          <Link href="/booking" className="text-xs text-accent hover:text-accent-hover transition-colors shrink-0">
            ← Изменить
          </Link>
        </div>

        <div className="flex items-start justify-between gap-3 pt-3 border-t border-[var(--border)]">
          <div className="flex-1">
            <p className="text-xs text-foreground-muted mb-1">Дата и время</p>
            <p className="text-sm font-medium">{dateFormatted}</p>
          </div>
          <Link href="/booking/step-2" className="text-xs text-accent hover:text-accent-hover transition-colors shrink-0">
            ← Изменить
          </Link>
        </div>
      </div>

      {result?.error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {result.error}
        </div>
      )}

      <div className="flex justify-between">
        <Link href="/booking/step-2" className="btn btn-secondary">← Назад</Link>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Отправка..." : "Записаться"}
        </button>
      </div>
    </div>
  );
}
