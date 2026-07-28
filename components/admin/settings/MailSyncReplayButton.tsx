"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toast } from "@/lib/ui/toast";
import { replayMailSyncDeadLetter } from "@/app/actions/mail-sync";

interface Props {
  emailMessageId: string;
}

/**
 * One-click replay of a dead-lettered message. The action is ADMIN-only and
 * idempotent, so an accidental double-click cannot create a duplicate CRM row.
 */
export function MailSyncReplayButton({ emailMessageId }: Props): React.ReactElement {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onReplay(): void {
    start(async () => {
      const result = await replayMailSyncDeadLetter(emailMessageId);
      if (!result.ok) {
        toast.error(result.error ?? "Не удалось воспроизвести");
        return;
      }
      toast.success("Письмо воспроизведено");
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={onReplay} isLoading={pending} disabled={pending}>
      Воспроизвести
    </Button>
  );
}
