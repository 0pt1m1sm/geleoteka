"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Textarea } from "@/components/ui";
import { sendEmailReply } from "@/app/actions/crm/inbox";

interface Props {
  customerUserId: string;
  dealId?: string | null;
  customerEmail: string;
  /** Pre-filled subject line ("Re: <prior>"). Display-only — server re-derives at submit. */
  suggestedSubject: string;
  onClose(): void;
}

export function EmailReplyForm({
  customerUserId,
  dealId,
  customerEmail,
  suggestedSubject,
  onClose,
}: Props): React.ReactElement {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [state, formAction, isPending] = useActionState(sendEmailReply, null);

  // Defer parent-mutation + router.refresh to commit phase so React 19's
  // strict cross-component setState guard doesn't block ("Cannot update a
  // component while rendering a different component").
  useEffect(() => {
    if (state?.error === null && !isPending) {
      onClose();
      router.refresh();
    }
  }, [state, isPending, onClose, router]);

  return (
    <form action={formAction} className="card space-y-3">
      <input type="hidden" name="customerUserId" value={customerUserId} />
      {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}

      <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
        <div className="text-[var(--foreground-muted)]">Кому:</div>
        <div className="font-mono text-xs">{customerEmail}</div>
        <div className="text-[var(--foreground-muted)]">Тема:</div>
        <div>{suggestedSubject}</div>
      </div>

      <Textarea
        label="Сообщение"
        name="body"
        rows={6}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Текст ответа. Подпись добавится автоматически."
      />

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
          Отмена
        </Button>
        <Button type="submit" isLoading={isPending} disabled={isPending || body.trim().length === 0}>
          Отправить
        </Button>
      </div>
    </form>
  );
}
