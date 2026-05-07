"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "@/app/actions/register";
import { NarrowFormPage } from "@/components/shared/NarrowFormPage";

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <NarrowFormPage
      title="Регистрация"
      description={
        <>
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-[var(--color-accent)] hover:underline">
            Войти
          </Link>
        </>
      }
    >
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
    </NarrowFormPage>
  );
}
