import type { ReactNode } from "react";

interface SuccessCardProps {
  /** Bold heading shown below the checkmark icon. */
  heading: string;
  /** Optional muted-text body between heading and CTAs. */
  message?: string;
  /** Optional CTA buttons / links rendered in a centered row. */
  children?: ReactNode;
}

/**
 * Centered success card with green checkmark icon. Used after booking submit
 * (`Step3ContactConfirm`) and cart checkout (`PartsCart`). Slot-based: the
 * caller composes its own CTAs as children.
 */
export function SuccessCard({ heading, message, children }: SuccessCardProps): React.ReactElement {
  return (
    <div className="card text-center py-12">
      <div className="w-16 h-16 rounded-full bg-[var(--color-success-bg)] mx-auto mb-6 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-[var(--color-success)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-display text-2xl font-bold mb-2">{heading}</h2>
      {message && <p className="text-[var(--foreground-muted)] mb-6">{message}</p>}
      {children && <div className="flex gap-4 justify-center">{children}</div>}
    </div>
  );
}
