"use client";

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

  async function handleDelete() {
    if (
      !(await confirm({
        message: `Удалить «${memberName}» из команды? Действие необратимо.`,
        danger: true,
      }))
    ) {
      return;
    }
    await deleteTeamMember(memberId);
    toast.success("Удалено из команды");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="text-xs text-[var(--color-error)] hover:underline shrink-0"
      title="Удалить из команды"
    >
      Удалить
    </button>
  );
}
