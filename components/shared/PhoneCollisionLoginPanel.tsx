"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginInlineForCheckout } from "@/app/actions/login";

interface Props {
  /** Phone the user typed that already belongs to another account. */
  phone: string;
  /** Called after successful login so the host form can re-submit using the new session. */
  onLoggedIn?: () => void;
}

/**
 * Shown above the checkout form when findOrCreateGuestCustomer reports
 * a phone-collision (telephone already attached to a different email).
 * Asks for the email + password tied to that phone — does not reveal
 * the registered email. On success the page is refreshed so server
 * components pick up the new session and the form re-renders with
 * LoggedInContactSummary.
 */
export function PhoneCollisionLoginPanel({ phone, onLoggedIn }: Props): React.ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await loginInlineForCheckout({
        email,
        password,
        expectedPhone: phone,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onLoggedIn?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card border border-[var(--color-warning,#f59e0b)]/40 bg-[var(--color-warning-bg,rgba(245,158,11,0.08))]">
      <h3 className="font-semibold mb-1">У вас уже есть аккаунт</h3>
      <p className="text-sm text-[var(--foreground-muted)] mb-3">
        Этот телефон ({phone}) уже привязан к существующему аккаунту. Войдите —
        и заказ автоматически свяжется с вашей историей.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="collision-email" className="block text-sm font-medium mb-2">
            Email от вашего аккаунта *
          </label>
          <input
            id="collision-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            className="input"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="collision-password" className="block text-sm font-medium mb-2">
            Пароль *
          </label>
          <input
            id="collision-password"
            type="password"
            autoComplete="current-password"
            required
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-3 py-2 rounded-lg text-xs">
            {error}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? "Входим…" : "Войти и продолжить"}
          </button>
          <a
            href="/reset-password"
            className="text-xs text-[var(--foreground-muted)] underline hover:text-[var(--foreground)]"
          >
            Не помню пароль — восстановить по SMS
          </a>
        </div>
      </form>
    </div>
  );
}
