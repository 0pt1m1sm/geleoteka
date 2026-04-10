"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/request-password-reset";

type ActionState = { error?: string; success?: true } | null;

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction as (prevState: ActionState, formData: FormData) => Promise<ActionState>, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-display text-2xl font-bold">
            <span className="text-[var(--color-accent)]">Geleoteka</span>
          </Link>
          <h1 className="text-2xl font-bold mt-6 mb-2">Восстановление пароля</h1>
          <p className="text-[var(--foreground-muted)]">
            Введите номер телефона для отправки кода
          </p>
        </div>

        <form action={formAction} className="card space-y-4">
          {state && "error" in state && state.error && (
            <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
              {state.error}
            </div>
          )}
          {state && "success" in state && (
            <div className="bg-[var(--color-success-bg)] text-[var(--color-success)] px-4 py-3 rounded-lg text-sm">
              Код отправлен на номер телефона
            </div>
          )}

          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон</label>
            <input id="phone" name="phone" type="tel" required className="input" placeholder="+7 (999) 123-45-67" />
          </div>

          <button type="submit" disabled={isPending} className="btn btn-primary w-full">
            {isPending ? "Отправка..." : "Получить код"}
          </button>

          <div className="text-center">
            <Link href="/login" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
              Вспомнили пароль? Войти
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
