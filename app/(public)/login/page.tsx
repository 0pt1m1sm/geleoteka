"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions/login";
import { NarrowFormPage } from "@/components/shared/NarrowFormPage";
import { Alert, Button, Card, Input } from "@/components/ui";

export default function LoginPage(): React.ReactElement {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <NarrowFormPage
      title="Вход в личный кабинет"
      description={
        <>
          Ещё нет аккаунта?{" "}
          <Link href="/register" className="text-[var(--color-accent)] hover:underline">
            Зарегистрироваться
          </Link>
        </>
      }
    >
      <Card>
        <form action={formAction} className="space-y-4">
          {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

          <Input
            label="Email"
            id="email"
            name="email"
            type="email"
            required
            placeholder="your@email.com"
            autoComplete="email"
          />

          <Input
            label="Пароль"
            id="password"
            name="password"
            type="password"
            required
            placeholder="Введите пароль"
            autoComplete="current-password"
          />

          <Button type="submit" isLoading={isPending} className="w-full">
            {isPending ? "Вход..." : "Войти"}
          </Button>

          <div className="text-center">
            <Link href="/reset-password" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
              Забыли пароль?
            </Link>
          </div>
        </form>
      </Card>
    </NarrowFormPage>
  );
}
