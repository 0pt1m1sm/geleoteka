"use client";

interface LoggedInContactSummaryProps {
  name: string;
  phone: string;
  email: string;
  onEdit: () => void;
  /** Render hidden name/phone/email inputs so FormData-based forms submit them. Skip for controlled forms. */
  asFormData?: boolean;
}

/**
 * Compact "order for" card shown to authenticated users on checkout flows
 * (booking, rentals, parts). Hides redundant Имя/Телефон/Email inputs
 * when the visitor's profile already has them. Tap "Изменить" to reveal
 * the full form and override per-order.
 */
export function LoggedInContactSummary({
  name,
  phone,
  email,
  onEdit,
  asFormData,
}: LoggedInContactSummaryProps): React.ReactElement {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--foreground-muted)] mb-1">Контактные данные</p>
          <p className="text-sm font-medium truncate">{name}</p>
          <p className="text-xs text-[var(--foreground-muted)] truncate">{phone}</p>
          <p className="text-xs text-[var(--foreground-muted)] truncate">{email}</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-[var(--color-accent)] hover:opacity-80 shrink-0"
        >
          Изменить
        </button>
      </div>
      {asFormData ? (
        <>
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="email" value={email} />
        </>
      ) : null}
    </div>
  );
}
