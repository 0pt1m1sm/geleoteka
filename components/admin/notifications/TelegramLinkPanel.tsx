"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  createPersonalTelegramLink,
  createSharedTelegramLink,
  refreshTelegramLinkStatus,
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
          {/* key: новая ссылка = новый watcher, иначе фаза «expired» от
              старой ссылки переживает перегенерацию и залипает. */}
          <LinkStatusWatcher
            key={state.expiresAt ?? "no-deadline"}
            purpose={purpose}
            expiresAt={state.expiresAt ?? null}
          />
        </Alert>
      ) : null}
    </div>
  );
}

type WatchState =
  | { phase: "waiting" }
  | { phase: "linked" }
  | { phase: "expired" };

const LINK_STATUS_POLL_MS = 5_000;

/**
 * Confirmation lives in our database, not in a bot reply: with a throttled
 * channel the reply can lag by minutes while the link row is already
 * committed. Poll the status action until the row appears, then refresh the
 * server page so it swaps to its linked state.
 */
function LinkStatusWatcher({
  purpose,
  expiresAt,
}: {
  purpose: "PERSONAL" | "SHARED";
  expiresAt: string | null;
}): React.ReactElement {
  const router = useRouter();
  const [watch, setWatch] = useState<WatchState>({ phase: "waiting" });
  const inFlight = useRef(false);

  useEffect(() => {
    if (watch.phase !== "waiting") return;
    const deadline = expiresAt ? Date.parse(expiresAt) : null;

    const timer = setInterval(async () => {
      if (inFlight.current) return;
      if (deadline !== null && Date.now() > deadline) {
        setWatch({ phase: "expired" });
        return;
      }
      inFlight.current = true;
      try {
        const status = await refreshTelegramLinkStatus(purpose);
        if (status.linked) {
          setWatch({ phase: "linked" });
          router.refresh();
        }
      } catch {
        // Транзиентный сбой проверки не повод останавливать ожидание.
      } finally {
        inFlight.current = false;
      }
    }, LINK_STATUS_POLL_MS);

    return () => clearInterval(timer);
  }, [watch.phase, purpose, expiresAt, router]);

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3 text-sm">
      {watch.phase === "waiting" ? (
        <span className="text-[var(--foreground-muted)]">
          Ожидаем привязку — проверяем автоматически каждые несколько секунд.
          Ответ бота в чате может запаздывать, ориентируйтесь на эту строку.
        </span>
      ) : null}
      {watch.phase === "linked" ? (
        <span className="font-medium text-[var(--color-success,#3fb950)]">
          ✓ Привязка выполнена и сохранена.
        </span>
      ) : null}
      {watch.phase === "expired" ? (
        <span>
          Срок ссылки истёк, привязка не зафиксирована. Создайте новую ссылку.
        </span>
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
          ? "Надёжнее всего отправить боту эту команду вручную: скопируйте и отправьте одним сообщением."
          : "Надёжнее всего отправить эту команду вручную в группе, куда добавлен бот, одним сообщением."}
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
