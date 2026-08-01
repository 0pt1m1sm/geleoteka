"use client";

import { useActionState } from "react";

import {
  resendEmailVerificationAction,
  type ResendEmailVerificationState,
} from "@/app/actions/email-verification";
import { Alert, Button, Card } from "@/components/ui";

const INITIAL_STATE: ResendEmailVerificationState | null = null;

export function EmailVerificationNotice(): React.ReactElement {
  const [state, action, pending] = useActionState(
    resendEmailVerificationAction,
    INITIAL_STATE,
  );

  return (
    <Card className="mb-6 border-[var(--border)] bg-[var(--background-secondary)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Подтвердите email</p>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Это поможет нам убедиться, что адрес принадлежит вам. Возможности кабинета уже доступны.
          </p>
        </div>
        <form action={action} className="shrink-0">
          <Button type="submit" variant="secondary" size="sm" isLoading={pending}>
            Отправить письмо повторно
          </Button>
        </form>
      </div>
      {state ? (
        <Alert
          variant={state.ok ? "success" : "info"}
          className="mt-3"
          aria-live="polite"
        >
          {state.message}
        </Alert>
      ) : null}
    </Card>
  );
}
