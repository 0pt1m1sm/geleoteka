"use client";

import { useRouter } from "next/navigation";
import { deleteAppointment } from "@/app/actions/admin";

export function DeleteAppointmentButton({ appointmentId, customerName }: { appointmentId: string; customerName: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Удалить запись ${customerName}? Действие необратимо.`)) return;
    await deleteAppointment(appointmentId);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="text-[10px] text-[var(--color-error)] hover:underline shrink-0"
      title="Удалить запись"
    >
      Удалить
    </button>
  );
}
