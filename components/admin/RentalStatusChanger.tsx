"use client";

import { useRouter } from "next/navigation";
import { updateRentalBookingStatus } from "@/app/actions/rentals";

const STATUSES = ["BOOKED", "ACTIVE", "RETURNED", "CANCELLED"];
const LABELS: Record<string, string> = {
  BOOKED: "Забронирована",
  ACTIVE: "Активна",
  RETURNED: "Завершена",
  CANCELLED: "Отменена",
};

export function RentalStatusChanger({ bookingId, currentStatus }: { bookingId: string; currentStatus: string }) {
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await updateRentalBookingStatus(bookingId, e.target.value);
    router.refresh();
  }

  return (
    <select value={currentStatus} onChange={handleChange} className="input text-xs py-1 px-2 w-auto mt-1">
      {STATUSES.map((s) => (
        <option key={s} value={s}>{LABELS[s]}</option>
      ))}
    </select>
  );
}
