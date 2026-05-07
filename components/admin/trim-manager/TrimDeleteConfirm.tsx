"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import type { TrimRow } from "./types";

interface TrimDeleteConfirmProps {
  trim: TrimRow | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TrimDeleteConfirm({
  trim,
  pending,
  onConfirm,
  onCancel,
}: TrimDeleteConfirmProps): React.ReactElement {
  return (
    <Dialog open={trim !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить вариант?</DialogTitle>
          <DialogDescription>
            Будет удалён вариант <span className="font-mono">{trim?.code}</span>. Действие
            необратимо.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onConfirm}
            disabled={pending}
            isLoading={pending}
          >
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
