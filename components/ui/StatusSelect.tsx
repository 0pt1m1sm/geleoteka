"use client";

import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "./Dialog";
import { Button } from "./Button";
import { Select } from "./Select";
import { Badge, type BadgeVariant } from "./Badge";

export interface StatusOption {
  value: string;
  label: string;
  variant?: BadgeVariant;
}

export interface StatusSelectProps {
  currentStatus: string;
  /** Allowed transitions from currentStatus. */
  availableStatuses: StatusOption[];
  /** Display label for currentStatus (used as Badge content). */
  currentLabel: string;
  currentVariant?: BadgeVariant;
  /** Called when user confirms a status change. */
  onChange: (next: string) => void | Promise<void>;
  /** Optional confirmation prompt body — defaults to a generic message. */
  confirmMessage?: ReactNode;
  /** Visible label above the select inside the Dialog. */
  selectLabel?: string;
  /** Trigger button text shown next to the badge. */
  triggerLabel?: string;
}

/**
 * StatusSelect — drop-in replacement for ad-hoc status changers.
 * Shows current status as Badge + button trigger; confirmation flow runs in Dialog.
 */
export function StatusSelect({
  currentStatus,
  availableStatuses,
  currentLabel,
  currentVariant = "neutral",
  onChange,
  confirmMessage = "Подтвердите смену статуса. Действие применится сразу.",
  selectLabel = "Новый статус",
  triggerLabel = "Изменить",
}: StatusSelectProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(currentStatus);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm(): Promise<void> {
    if (pending === currentStatus) {
      setOpen(false);
      return;
    }
    setSubmitting(true);
    try {
      await onChange(pending);
    } finally {
      setSubmitting(false);
      setOpen(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPending(currentStatus);
      }}
    >
      <div className="inline-flex items-center gap-2">
        <Badge variant={currentVariant}>{currentLabel}</Badge>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            {triggerLabel}
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Смена статуса</DialogTitle>
          <DialogDescription>{confirmMessage}</DialogDescription>
        </DialogHeader>
        <Select
          label={selectLabel}
          value={pending}
          onChange={(e) => setPending(e.target.value)}
        >
          {availableStatuses.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={submitting}>
              Отмена
            </Button>
          </DialogClose>
          <Button onClick={handleConfirm} isLoading={submitting} disabled={pending === currentStatus}>
            Применить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
