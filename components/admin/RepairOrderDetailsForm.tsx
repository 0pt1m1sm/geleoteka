"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Select, Textarea } from "@/components/ui";
import { updateRepairOrderDetails } from "@/app/actions/admin";

interface MasterOption {
  id: string;
  name: string;
}

interface Props {
  repairOrderId: string;
  initial: {
    concern: string;
    notes: string;
    mileageIn: string;
    mileageOut: string;
    promisedAt: string;
    masterUserId: string;
  };
  masters: MasterOption[];
}

/**
 * Edits the manager-facing RO fields that don't belong in JobLine CRUD:
 * customer concern, internal notes, mileage at intake/return, promised
 * delivery date, and master assignment. Single form, single save action,
 * to keep the surface scannable.
 */
export function RepairOrderDetailsForm({
  repairOrderId,
  initial,
  masters,
}: Props): React.ReactElement {
  const [state, formAction, isPending] = useActionState(
    updateRepairOrderDetails,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="repairOrderId" value={repairOrderId} />

      <Textarea
        label="Жалоба клиента"
        name="concern"
        defaultValue={initial.concern}
        placeholder="Своими словами, как описал клиент"
        rows={2}
      />

      <Textarea
        label="Заметки мастера"
        name="notes"
        defaultValue={initial.notes}
        placeholder="Внутренние заметки, диагностика, рекомендации"
        rows={3}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Пробег при приёмке (км)"
          name="mileageIn"
          type="number"
          inputMode="numeric"
          defaultValue={initial.mileageIn}
          placeholder="например, 145000"
        />
        <Input
          label="Пробег при выдаче (км)"
          name="mileageOut"
          type="number"
          inputMode="numeric"
          defaultValue={initial.mileageOut}
          placeholder="заполните при сдаче"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Обещанная дата готовности"
          name="promisedAt"
          type="datetime-local"
          defaultValue={initial.promisedAt}
        />
        <Select
          label="Мастер"
          name="masterUserId"
          defaultValue={initial.masterUserId}
        >
          <option value="">Не назначен</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </div>

      {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={isPending} disabled={isPending}>
          {isPending ? "Сохранение..." : "Сохранить"}
        </Button>
        {state?.success && !state?.error && !isPending ? (
          <span className="text-xs text-[var(--color-success)]">
            Сохранено
          </span>
        ) : null}
      </div>
    </form>
  );
}
