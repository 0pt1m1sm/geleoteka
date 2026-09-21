"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteTeamMember } from "@/app/actions/team-members";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

export function DeleteTeamMemberButton({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    void (async () => {
      if (
        !(await confirm({
          message: `Удалить «${memberName}» из команды? Действие необратимо.`,
          danger: true,
        }))
      ) {
        return;
      }
      startTransition(async () => {
        try {
          await deleteTeamMember(memberId);
          toast.success("Удалено из команды");
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Не удалось удалить");
        }
      });
    })();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="text-xs text-[var(--color-error)] hover:underline shrink-0 disabled:opacity-50"
      title="Удалить из команды"
    >
      Удалить
    </button>
  );
}
