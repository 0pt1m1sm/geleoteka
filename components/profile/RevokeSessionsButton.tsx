"use client";

import { useActionState } from "react";

import { Alert, Button } from "@/components/ui";
import { revokeOtherSessions } from "@/app/actions/profile";

export function RevokeSessionsButton(): React.ReactElement {
  const [state, formAction, isPending] = useActionState(revokeOtherSessions, null);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.success ? (
        <Alert variant="success">
          Готово: все остальные устройства разлогинены. Эта сессия продолжает работать.
        </Alert>
      ) : null}
      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? "Выходим…" : "Выйти на всех устройствах"}
      </Button>
    </form>
  );
}
