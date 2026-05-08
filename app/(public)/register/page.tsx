"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "@/app/actions/register";
import { NarrowFormPage } from "@/components/shared/NarrowFormPage";
import { Alert, Button, Card, Input } from "@/components/ui";
import { EMAIL_PATTERN, EMAIL_TITLE, PHONE_PATTERN, PHONE_TITLE } from "@/lib/utils";

export default function RegisterPage(): React.ReactElement {
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
      <Card>
        <form action={formAction} className="space-y-4">
          {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

          <Input
            label="Имя"
            id="name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={120}
            placeholder="Иван Иванов"
            autoComplete="name"
          />
          <Input
            label="Email"
            id="email"
            name="email"
            type="email"
            inputMode="email"
            required
            pattern={EMAIL_PATTERN}
            title={EMAIL_TITLE}
            placeholder="your@email.com"
            autoComplete="email"
          />
          <Input
            label="Телефон"
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            pattern={PHONE_PATTERN}
            title={PHONE_TITLE}
            placeholder="+79991234567"
            autoComplete="tel"
          />
          <Input
            label="Пароль"
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="Минимум 6 символов"
            autoComplete="new-password"
          />

          <Button type="submit" isLoading={isPending} className="w-full">
            {isPending ? "Регистрация..." : "Зарегистрироваться"}
          </Button>
        </form>
      </Card>
    </NarrowFormPage>
  );
}
