"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { runMailSyncNow } from "@/app/actions/mail-sync";
import { Button } from "@/components/ui";

/**
 * Ручной пул почты. Фоновый воркер и так проверяет ящик раз в минуту;
 * кнопка — для «я только что отправил письмо и хочу увидеть его сейчас».
 */
export function MailPullButton(): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function pull(): void {
    setMessage(null);
    startTransition(async () => {
      const result = await runMailSyncNow();
      if (result.ok) {
        const created = result.created ?? 0;
        setMessage(
          created > 0
            ? `Готово: новых писем — ${created}`
            : "Готово: новых писем нет",
        );
        router.refresh();
      } else {
        setMessage(result.error ?? "Не удалось проверить почту");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        onClick={pull}
        disabled={pending}
        isLoading={pending}
      >
        Проверить почту сейчас
      </Button>
      {message ? (
        <span className="text-sm text-[var(--foreground-muted)]">{message}</span>
      ) : null}
    </div>
  );
}
