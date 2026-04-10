"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "@/app/actions/register";

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-display text-2xl font-bold">
            <span className="text-[var(--color-accent)]">Geleoteka</span>
          </Link>
          <h1 className="text-2xl font-bold mt-6 mb-2">Регистрация</h1>
          <p className="text-[var(--foreground-muted)]">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-[var(--color-accent)] hover:underline">
              Войти
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
            <label htmlFor="name" className="block text-sm font-medium mb-2">Имя</label>
            <input id="name" name="name" type="text" required className="input" placeholder="Иван Иванов" />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">Email</label>
            <input id="email" name="email" type="email" required className="input" placeholder="your@email.com" />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон</label>
            <input id="phone" name="phone" type="tel" required className="input" placeholder="+7 (999) 123-45-67" />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">Пароль</label>
            <input id="password" name="password" type="password" required className="input" placeholder="Минимум 6 символов" />
          </div>

          <button type="submit" disabled={isPending} className="btn btn-primary w-full">
            {isPending ? "Регистрация..." : "Зарегистрироваться"}
          </button>
        </form>
      </div>
    </div>
  );
}
