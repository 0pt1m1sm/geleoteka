"use client";

import { useRouter } from "next/navigation";
import { deleteService } from "@/app/actions/services";

export function DeleteServiceButton({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName: string;
}) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Удалить услугу «${serviceName}»? Действие необратимо.`)) return;
    await deleteService(serviceId);
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
