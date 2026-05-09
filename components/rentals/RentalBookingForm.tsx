"use client";

import { useState } from "react";
import Link from "next/link";
import { createRentalBooking } from "@/app/actions/rentals";
import { SuccessCard } from "@/components/shared/SuccessCard";
import { PostCheckoutAuthPanel } from "@/components/shared/PostCheckoutAuthPanel";
import { formatPrice } from "@/lib/utils";
import { contactDraftStore, clearContactDraft } from "@/lib/contact-draft";
import { LoggedInContactSummary } from "@/components/shared/LoggedInContactSummary";
import { GuestContactFields } from "@/components/shared/GuestContactFields";
import { DateField } from "./DateField";

interface OccupiedRange {
  start: string; // YYYY-MM-DD
  end: string;
}

interface Prefill {
  name: string;
  phone: string;
  email: string;
}

interface Props {
  carId: string;
  dailyRate: number;
  occupiedRanges?: OccupiedRange[];
  prefill?: Prefill | null;
}

function formatRange(r: OccupiedRange): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  };
  return r.start === r.end ? fmt(r.start) : `${fmt(r.start)} – ${fmt(r.end)}`;
}

function rangesOverlap(aStart: string, aEnd: string, occupied: OccupiedRange[]): boolean {
  return occupied.some((r) => aStart <= r.end && aEnd >= r.start);
}

interface RentalResultState {
  success: boolean;
  bookingId?: string;
  userId?: string;
  isReturningCustomer?: boolean;
  claimToken?: string | null;
  error?: string;
}

export function RentalBookingForm({ carId, dailyRate, occupiedRanges = [], prefill = null }: Props) {
  const draft = contactDraftStore.useStore();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RentalResultState | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [minDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });

  function persistDraft(field: keyof typeof draft, value: string): void {
    contactDraftStore.setStore({ ...contactDraftStore.getStore(), [field]: value });
  }

  // Prefill priority: existing draft (current edits) → session prefill (logged-in user)
  const initialName = draft.name || prefill?.name || "";
  const initialPhone = draft.phone || prefill?.phone || "";
  const initialEmail = draft.email || prefill?.email || "";

  const days = startDate && endDate
    ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const total = days * dailyRate;
  const conflictsWithOccupied =
    startDate && endDate ? rangesOverlap(startDate, endDate, occupiedRanges) : false;

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    const emailAtSubmit = (formData.get("email") as string) ?? "";
    const res = await createRentalBooking({
      carId,
      startDate,
      endDate,
      contactName: formData.get("name") as string,
      contactPhone: formData.get("phone") as string,
      contactEmail: emailAtSubmit,
      notes: (formData.get("notes") as string) || "",
    });
    setResult(res);
    setSubmitting(false);
    if (res.success) {
      setSubmittedEmail(emailAtSubmit.trim().toLowerCase());
      clearContactDraft();
    }
  }

  if (result?.success) {
    const showPanel =
      !prefill &&
      result.userId &&
      result.claimToken &&
      submittedEmail &&
      result.bookingId;
    return (
      <div className="space-y-6">
        <SuccessCard
          heading="Заявка отправлена!"
          message="Мы свяжемся для подтверждения бронирования."
        >
          <Link href="/rentals" className="btn btn-secondary">К каталогу</Link>
          <Link href="/cabinet/rentals" className="btn btn-primary">Мои аренды</Link>
        </SuccessCard>
        {showPanel ? (
          <PostCheckoutAuthPanel
            kind="rental"
            orderId={result.bookingId!}
            claimToken={result.claimToken!}
            email={submittedEmail!}
            isReturning={result.isReturningCustomer ?? false}
          />
        ) : null}
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
      {occupiedRanges.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-3 text-xs">
          <p className="font-medium text-[var(--foreground)] mb-1.5">Занятые даты:</p>
          <ul className="space-y-0.5 text-[var(--foreground-muted)]">
            {occupiedRanges.map((r) => (
              <li key={`${r.start}-${r.end}`}>· {formatRange(r)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-3">
        <DateField label="С *" value={startDate} onChange={setStartDate} min={minDate} required />
        <DateField label="По *" value={endDate} onChange={setEndDate} min={startDate || minDate} required />
      </div>
      {conflictsWithOccupied && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-3 py-2 rounded-lg text-xs">
          Выбранный период пересекается с занятыми датами. Выберите другой диапазон.
        </div>
      )}

      {days > 0 && (
        <div className="bg-[var(--background-secondary)] rounded-lg p-3 text-center">
          <span className="text-sm text-[var(--foreground-muted)]">{days} дн. × {formatPrice(dailyRate)} = </span>
          <span className="text-lg font-bold text-[var(--color-accent)]">{formatPrice(total)}</span>
        </div>
      )}

      {prefill && !editingContact ? (
        <LoggedInContactSummary
          name={prefill.name}
          phone={prefill.phone}
          email={prefill.email}
          onEdit={() => setEditingContact(true)}
          asFormData
        />
      ) : (
        <GuestContactFields
          mode="uncontrolled"
          initialName={initialName}
          initialPhone={initialPhone}
          initialEmail={initialEmail}
          onDraftChange={persistDraft}
        />
      )}
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

      <button
        type="submit"
        disabled={submitting || days === 0 || conflictsWithOccupied}
        className="btn btn-primary w-full"
      >
        {submitting
          ? "Отправка..."
          : conflictsWithOccupied
          ? "Даты заняты"
          : days > 0
          ? `Забронировать — ${formatPrice(total)}`
          : "Выберите даты"}
      </button>
    </form>
  );
}
