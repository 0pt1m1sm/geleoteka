"use client";

const STEPS = [
  "Услуги и авто",
  "Дата и время",
  "Контакты",
];

export function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--color-accent)] text-white"
                  : isDone
                    ? "bg-[var(--color-success)] text-white"
                    : "bg-[var(--color-secondary)] text-[var(--foreground-muted)]"
              }`}
            >
              {isDone ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step
              )}
            </div>
            <span
              className={`text-xs hidden sm:block ${
                isActive ? "text-[var(--foreground)]" : "text-[var(--foreground-muted)]"
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`w-6 h-px ${
                  isDone ? "bg-[var(--color-success)]" : "bg-[var(--border)]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
