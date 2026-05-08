"use client";

import { useActionState } from "react";
import Link from "next/link";
import { confirmResetPasswordAction } from "@/app/actions/confirm-reset-password";
import { NarrowFormPage } from "@/components/shared/NarrowFormPage";
import { PHONE_PATTERN, PHONE_TITLE } from "@/lib/utils";

export default function ConfirmResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(confirmResetPasswordAction, null);

  return (
    <NarrowFormPage
      title="Введите код"
      description="Код отправлен на номер телефона"
    >
      <form action={formAction} className="card space-y-4">
        {state?.error && (
          <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
            {state.error}
          </div>
        )}

        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            pattern={PHONE_PATTERN}
            title={PHONE_TITLE}
            className="input"
            placeholder="+79991234567"
          />
        </div>

        <div>
          <label htmlFor="code" className="block text-sm font-medium mb-2">Код из SMS</label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern="[0-9]{6}"
            title="Введите 6-значный код из SMS"
            minLength={6}
            maxLength={6}
            className="input"
            placeholder="123456"
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium mb-2">Новый пароль</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            className="input"
            placeholder="Минимум 6 символов"
          />
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
    </NarrowFormPage>
  );
}
