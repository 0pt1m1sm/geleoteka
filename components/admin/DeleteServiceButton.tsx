"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteService } from "@/app/actions/services";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

export function DeleteServiceButton({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    void (async () => {
      if (!(await confirm({ message: `Удалить услугу «${serviceName}»? Действие необратимо.`, danger: true }))) return;
      startTransition(async () => {
        try {
          await deleteService(serviceId);
          toast.success("Услуга удалена");
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Не удалось удалить услугу");
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
      title="Удалить услугу"
    >
      Удалить
    </button>
  );
}
