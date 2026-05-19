"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Textarea,
  Alert,
} from "@/components/ui";
import {
  updateRentalBooking,
  deleteRentalBooking,
} from "@/app/actions/rentals";
import { confirm } from "@/lib/ui/confirm";
import { toast } from "@/lib/ui/toast";

interface BookingForEdit {
  id: string;
  startDate: Date;
  endDate: Date;
  totalCost: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string | null;
}

interface Props {
  booking: BookingForEdit;
}

function toLocalDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Pencil-trigger dialog to edit a RentalBooking. Lives in the bookings
 * list row. Vehicle reassignment is out of scope — for that, delete +
 * recreate.
 */
export function RentalBookingEditDialog({ booking }: Props): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: { preventDefault: () => void; currentTarget: HTMLFormElement }): void {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateRentalBooking(booking.id, fd);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Бронирование обновлено");
      setOpen(false);
      router.refresh();
    });
  }

  async function handleDelete(): Promise<void> {
    const ok = await confirm({
      title: "Удалить бронирование",
      message: `Удалить бронирование «${booking.contactName}»? Действие необратимо.`,
      danger: true,
      confirmText: "Удалить",
    });
    if (!ok) return;
    startDelete(async () => {
      const result = await deleteRentalBooking(booking.id);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Бронирование удалено");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-icon shrink-0"
        aria-label="Редактировать бронирование"
        title="Редактировать"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактирование бронирования</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Имя клиента"
              name="contactName"
              required
              defaultValue={booking.contactName}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Телефон"
                name="contactPhone"
                type="tel"
                required
                defaultValue={booking.contactPhone}
                placeholder="+79991234567"
              />
              <Input
                label="Email"
                name="contactEmail"
                type="email"
                required
                defaultValue={booking.contactEmail}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Дата выдачи"
                name="startDate"
                type="date"
                required
                defaultValue={toLocalDate(booking.startDate)}
              />
              <Input
                label="Дата возврата"
                name="endDate"
                type="date"
                required
                defaultValue={toLocalDate(booking.endDate)}
              />
            </div>
            <Input
              label="Стоимость, ₽"
              name="totalCost"
              type="number"
              inputMode="numeric"
              required
              min="0"
              defaultValue={String(booking.totalCost)}
            />
            <Textarea
              label="Заметка"
              name="notes"
              rows={3}
              defaultValue={booking.notes ?? ""}
              placeholder="Внутренний комментарий"
            />
            {error ? <Alert variant="error">{error}</Alert> : null}
            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="secondary"
                className="text-[var(--color-error)] mr-auto"
                onClick={handleDelete}
                isLoading={isDeleting}
                disabled={isDeleting || pending}
              >
                Удалить
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={pending || isDeleting}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                isLoading={pending}
                disabled={pending || isDeleting}
              >
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
