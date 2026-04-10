"use client";

import { useActionState } from "react";
import Link from "next/link";
import { confirmResetPasswordAction } from "@/app/actions/confirm-reset-password";

export default function ConfirmResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(confirmResetPasswordAction, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-display text-2xl font-bold">
            <span className="text-[var(--color-accent)]">Geleoteka</span>
          </Link>
          <h1 className="text-2xl font-bold mt-6 mb-2">Введите код</h1>
          <p className="text-[var(--foreground-muted)]">
            Код отправлен на номер телефона
          </p>
        </div>

        <form action={formAction} className="card space-y-4">
          {state?.error && (
            <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
              {state.error}
            </div>
          )}

          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон</label>
            <input id="phone" name="phone" type="tel" required className="input" placeholder="+7 (999) 123-45-67" />
          </div>

          <div>
            <label htmlFor="code" className="block text-sm font-medium mb-2">Код из SMS</label>
            <input id="code" name="code" type="text" required className="input" placeholder="123456" maxLength={6} />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium mb-2">Новый пароль</label>
            <input id="newPassword" name="newPassword" type="password" required className="input" placeholder="Минимум 6 символов" />
          </div>

          <button type="submit" disabled={isPending} className="btn btn-primary w-full">
            {isPending ? "Сохранение..." : "Изменить пароль"}
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
