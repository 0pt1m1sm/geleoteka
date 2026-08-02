"use client";

import { useActionState } from "react";

import {
  sendPersonalTelegramTest,
  sendSharedTelegramTest,
  type TelegramTestNotificationState,
} from "@/app/actions/staff-notifications";
import { Alert, Button } from "@/components/ui";
import { getTelegramTestResultCopy } from "@/lib/staff-notifications/channels/telegram/test-copy";

interface TelegramTestButtonProps {
  purpose: "PERSONAL" | "SHARED";
}

export function TelegramTestButton({
  purpose,
}: TelegramTestButtonProps): React.ReactElement {
  const action =
    purpose === "PERSONAL"
      ? sendPersonalTelegramTest
      : sendSharedTelegramTest;
  const [state, formAction, pending] = useActionState<
    TelegramTestNotificationState | null,
    FormData
  >(action, null);

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending}
          isLoading={pending}
        >
          {pending ? "Проверяем канал…" : "Отправить тестовое уведомление"}
        </Button>
      </form>
      <TelegramTestResult state={state} />
    </div>
  );
}

function TelegramTestResult({
  state,
}: {
  state: TelegramTestNotificationState | null;
}): React.ReactElement | null {
  if (!state) return null;
  const copy = getTelegramTestResultCopy(state);
  return (
    <Alert variant={copy.variant} title={copy.title} aria-live="polite">
      {copy.message}
    </Alert>
  );
}
