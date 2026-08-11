"use client";

import { useActionState } from "react";

import { Alert, Button, Input } from "@/components/ui";
import { changeOwnPassword } from "@/app/actions/profile";

export function ChangePasswordForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState(changeOwnPassword, null);

  return (
    <form action={formAction} className="space-y-4">
      <Input
        label="Текущий пароль"
        name="currentPassword"
        type="password"
        required
        autoComplete="current-password"
      />
      <Input
        label="Новый пароль"
        name="newPassword"
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        helperText="Минимум 6 символов"
      />
      <Input
        label="Повторите новый пароль"
        name="repeatPassword"
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
      />

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.success ? <Alert variant="success">Пароль изменён</Alert> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохраняем…" : "Сменить пароль"}
      </Button>
    </form>
  );
}
