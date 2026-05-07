"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/request-password-reset";
import { NarrowFormPage } from "@/components/shared/NarrowFormPage";
import { Alert, Button, Card, Input } from "@/components/ui";

type ActionState = { error?: string; success?: true } | null;

export default function ResetPasswordPage(): React.ReactElement {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction as (prevState: ActionState, formData: FormData) => Promise<ActionState>,
    null,
  );

  return (
    <NarrowFormPage
      title="Восстановление пароля"
      description="Введите номер телефона для отправки кода"
    >
      <Card>
        <form action={formAction} className="space-y-4">
          {state && "error" in state && state.error ? (
            <Alert variant="error">{state.error}</Alert>
          ) : null}
          {state && "success" in state ? (
            <Alert variant="success">Код отправлен на номер телефона</Alert>
          ) : null}

          <Input
            label="Телефон"
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="+7 (999) 123-45-67"
            autoComplete="tel"
          />

          <Button type="submit" isLoading={isPending} className="w-full">
            {isPending ? "Отправка..." : "Получить код"}
          </Button>

          <div className="text-center">
            <Link href="/login" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
              Вспомнили пароль? Войти
            </Link>
          </div>
        </form>
      </Card>
    </NarrowFormPage>
  );
}
