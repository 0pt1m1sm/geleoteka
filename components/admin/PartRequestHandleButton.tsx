"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPartRequestHandled } from "@/app/actions/part-requests";
import { toast } from "@/lib/ui/toast";

/** Отметить заявку обработанной. Сотрудник связался — строка уходит вниз. */
export function PartRequestHandleButton({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markPartRequestHandled(id, userId);
          toast.success("Заявка отмечена обработанной");
          router.refresh();
        })
      }
      className="btn btn-secondary btn-sm shrink-0 disabled:opacity-50"
    >
      Обработана
    </button>
  );
}
