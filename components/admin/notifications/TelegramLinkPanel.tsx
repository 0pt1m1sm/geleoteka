"use client";

import { useActionState, useState } from "react";

import {
  createPersonalTelegramLink,
  createSharedTelegramLink,
  type CreateTelegramLinkState,
} from "@/app/actions/staff-notifications";
import { Alert, Button } from "@/components/ui";
import { getTelegramLinkPanelCopy } from "@/lib/staff-notifications/channels/telegram/link-copy";

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
  const copy = getTelegramLinkPanelCopy(purpose);
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
          {copy.buttonLabel}
        </Button>
      </form>
      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.ok && state.deepLink && state.manualCommand ? (
        <Alert variant="success">
          <span className="block mb-2">{copy.successMessage}</span>
          <a
            href={state.deepLink}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--color-accent)] underline"
          >
            {purpose === "PERSONAL"
              ? "Открыть Telegram и привязать"
              : "Выбрать группу в Telegram"}
          </a>
          <ManualLinkCommand command={state.manualCommand} purpose={purpose} />
        </Alert>
      ) : null}
    </div>
  );
}

function ManualLinkCommand({
  command,
  purpose,
}: {
  command: string;
  purpose: "PERSONAL" | "SHARED";
}): React.ReactElement {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [failedCommand, setFailedCommand] = useState<string | null>(null);

  async function copyCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      setFailedCommand(null);
    } catch {
      setCopiedCommand(null);
      setFailedCommand(command);
    }
  }

  const copied = copiedCommand === command;
  const failed = failedCommand === command;

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <p className="mb-2">
        {purpose === "PERSONAL"
          ? "Если после перехода по ссылке бот не ответил, отправьте ему эту команду вручную."
          : "Если после перехода по ссылке бот не ответил, отправьте эту команду вручную в группе, куда добавлен бот."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 select-all break-all rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2 font-mono text-xs text-[var(--foreground)]">
          {command}
        </code>
        <button
          type="button"
          onClick={() => void copyCommand()}
          className="shrink-0 text-left text-xs font-medium text-[var(--color-accent)] hover:underline sm:text-center"
        >
          {copied ? "✓ Скопировано" : failed ? "Не удалось — выделите команду" : "Копировать"}
        </button>
      </div>
    </div>
  );
}
