"use client";

import { useActionState } from "react";

import {
  createPersonalTelegramLink,
  createSharedTelegramLink,
  type CreateTelegramLinkState,
} from "@/app/actions/staff-notifications";
import { Alert, Button } from "@/components/ui";

interface TelegramLinkPanelProps {
  purpose: "PERSONAL" | "SHARED";
  configured: boolean;
}

export function TelegramLinkPanel({
  purpose,
  configured,
}: TelegramLinkPanelProps): React.ReactElement {
  const action =
    purpose === "PERSONAL" ? createPersonalTelegramLink : createSharedTelegramLink;
  const [state, formAction, pending] = useActionState<CreateTelegramLinkState | null, FormData>(
    action,
    null,
  );

  return (
    <div className="space-y-3">
      {!configured ? (
        <Alert variant="info">
          Telegram выключен или конфигурация неполна. Привязка станет доступна после настройки.
        </Alert>
      ) : null}
      <form action={formAction}>
        <Button type="submit" disabled={!configured || pending} isLoading={pending}>
          Создать ссылку на 10 минут
        </Button>
      </form>
      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.ok && state.deepLink ? (
        <Alert variant="success">
          <span className="block mb-2">
            Откройте ссылку в приватном чате с ботом. Она одноразовая и истечёт через 10 минут.
          </span>
          <a
            href={state.deepLink}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--color-accent)] underline"
          >
            Открыть Telegram и привязать
          </a>
        </Alert>
      ) : null}
    </div>
  );
}

