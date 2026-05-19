"use client";

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

  async function handleDelete() {
    if (!(await confirm({ message: `Удалить услугу «${serviceName}»? Действие необратимо.`, danger: true }))) return;
    await deleteService(serviceId);
    toast.success("Услуга удалена");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="text-xs text-[var(--color-error)] hover:underline shrink-0"
      title="Удалить услугу"
    >
      Удалить
    </button>
  );
}
