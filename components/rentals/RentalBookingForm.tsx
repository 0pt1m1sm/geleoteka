"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { createRentalBooking } from "@/app/actions/rentals";
import {
  EMAIL_PATTERN,
  EMAIL_TITLE,
  PHONE_PATTERN,
  PHONE_TITLE,
  formatPrice,
} from "@/lib/utils";
import { contactDraftStore, clearContactDraft } from "@/lib/contact-draft";
import { DateField } from "./DateField";

interface Props {
  carId: string;
  dailyRate: number;
}

export function RentalBookingForm({ carId, dailyRate }: Props) {
  const draft = contactDraftStore.useStore();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [minDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });

  function persistDraft(field: keyof typeof draft, value: string): void {
    contactDraftStore.setStore({ ...contactDraftStore.getStore(), [field]: value });
  }

  const days = startDate && endDate
    ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const total = days * dailyRate;

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    const res = await createRentalBooking({
      carId,
      startDate,
      endDate,
      contactName: formData.get("name") as string,
      contactPhone: formData.get("phone") as string,
      contactEmail: formData.get("email") as string,
      notes: (formData.get("notes") as string) || "",
    });
    setResult(res);
    setSubmitting(false);
    if (res.success) {
      clearContactDraft();
    }
  }

  if (result?.success) {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 rounded-full bg-[var(--color-success-bg)] mx-auto mb-4 flex items-center justify-center">
          <Check className="w-6 h-6 text-[var(--color-success)]" aria-hidden />
        </div>
        <h3 className="font-bold text-lg mb-2">Заявка отправлена!</h3>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">
          Мы свяжемся для подтверждения бронирования.
        </p>
        <Link href="/rentals" className="btn btn-secondary text-sm">
          К каталогу
        </Link>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {result?.error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {result.error}
        </div>
      )}

      <p className="text-sm text-[var(--foreground-muted)] -mt-2">
        Нажмите на поле, чтобы выбрать дату.
      </p>
      <div className="space-y-3">
        <DateField label="С *" value={startDate} onChange={setStartDate} min={minDate} required />
        <DateField label="По *" value={endDate} onChange={setEndDate} min={startDate || minDate} required />
      </div>

      {days > 0 && (
        <div className="bg-[var(--background-secondary)] rounded-lg p-3 text-center">
          <span className="text-sm text-[var(--foreground-muted)]">{days} дн. × {formatPrice(dailyRate)} = </span>
          <span className="text-lg font-bold text-[var(--color-accent)]">{formatPrice(total)}</span>
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-2">Имя *</label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          className="input"
          placeholder="Иван Иванов"
          defaultValue={draft.name}
          onChange={(e) => persistDraft("name", e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон *</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          pattern={PHONE_PATTERN}
          title={PHONE_TITLE}
          className="input"
          placeholder="+79991234567"
          defaultValue={draft.phone}
          onChange={(e) => persistDraft("phone", e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-2">Email *</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          pattern={EMAIL_PATTERN}
          title={EMAIL_TITLE}
          className="input"
          placeholder="your@email.com"
          defaultValue={draft.email}
          onChange={(e) => persistDraft("email", e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="notes" className="block text-sm font-medium mb-2">Комментарий</label>
        <textarea
          id="notes"
          name="notes"
          className="input min-h-[60px] resize-y"
          placeholder="Пожелания..."
          defaultValue={draft.notes}
          onChange={(e) => persistDraft("notes", e.target.value)}
        />
      </div>

      <button type="submit" disabled={submitting || days === 0} className="btn btn-primary w-full">
        {submitting ? "Отправка..." : days > 0 ? `Забронировать — ${formatPrice(total)}` : "Выберите даты"}
      </button>
    </form>
  );
}
