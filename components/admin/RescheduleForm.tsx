"use client";

import { useActionState } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { rescheduleRepairOrder } from "@/app/actions/admin";

interface Props {
  repairOrderId: string;
  /** Current appointment, pre-formatted for a datetime-local input. */
  initialDateTime: string;
  /** Cancelled orders have no slot to move; the control is shown disabled. */
  disabled?: boolean;
}

/**
 * Moves an existing booking to another time — kept separate from the details
 * form on purpose: this write can legitimately fail (the target time may be
 * taken), and that failure must not block saving unrelated fields like mileage
 * or the master assignment.
 */
export function RescheduleForm({
  repairOrderId,
  initialDateTime,
  disabled = false,
}: Props): React.ReactElement {
  const [state, formAction, isPending] = useActionState(rescheduleRepairOrder, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="repairOrderId" value={repairOrderId} />

      <Input
        label="Дата и время записи"
        name="dateTime"
        type="datetime-local"
        defaultValue={initialDateTime}
        disabled={disabled}
      />

      <p className="text-xs text-[var(--foreground-muted)]">
        Перенос двигает и запись, и занятый слот в календаре. Время вне обычной сетки
        допустимо, но занятое другой записью — нет.
      </p>

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={isPending} disabled={isPending || disabled}>
          {isPending ? "Перенос..." : "Перенести"}
        </Button>
        {state?.success && !state?.error && !isPending ? (
          <span className="text-xs text-[var(--color-success)]">Перенесено</span>
        ) : null}
      </div>
    </form>
  );
}
