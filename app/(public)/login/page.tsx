"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions/login";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-display text-2xl font-bold">
            <span className="text-[var(--color-accent)]">Geleoteka</span>
          </Link>
          <h1 className="text-2xl font-bold mt-6 mb-2">Вход в личный кабинет</h1>
          <p className="text-[var(--foreground-muted)]">
            Ещё нет аккаунта?{" "}
            <Link href="/register" className="text-[var(--color-accent)] hover:underline">
              Зарегистрироваться
            </Link>
          </p>
        </div>

        <form action={formAction} className="card space-y-4">
          {state?.error && (
            <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
              {state.error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">Email</label>
            <input id="email" name="email" type="email" required className="input" placeholder="your@email.com" />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">Пароль</label>
            <input id="password" name="password" type="password" required className="input" placeholder="Введите пароль" />
          </div>

          <button type="submit" disabled={isPending} className="btn btn-primary w-full">
            {isPending ? "Вход..." : "Войти"}
          </button>

          <div className="text-center">
            <Link href="/reset-password" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
              Забыли пароль?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
