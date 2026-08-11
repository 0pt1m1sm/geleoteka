"use client";

import { useActionState, useState } from "react";

import { Alert, Button, Input } from "@/components/ui";
import { deleteOwnAccount } from "@/app/actions/profile";

export function DeleteAccountForm(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(deleteOwnAccount, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-[var(--color-error)] hover:underline"
      >
        Удалить аккаунт…
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Alert variant="error">
        Аккаунт будет удалён, доступ в кабинет закрыт на всех устройствах.
        Восстановить его сможет только сервис по вашему обращению.
      </Alert>
      <Input
        label="Пароль для подтверждения"
        name="password"
        type="password"
        required
        autoComplete="current-password"
      />
      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="btn btn-secondary border-[var(--color-error)] text-[var(--color-error)]"
        >
          {isPending ? "Удаляем…" : "Удалить аккаунт навсегда"}
        </button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
