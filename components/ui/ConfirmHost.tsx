"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import {
  resolveConfirm,
  subscribeConfirm,
  type ConfirmRequest,
} from "@/lib/ui/confirm";

/**
 * Mounted once at the root layout. Listens to the confirm() singleton and
 * renders the branded confirmation dialog when a prompt is in flight.
 *
 * Resolve(false) on Esc, click-outside, or Cancel. Resolve(true) on Confirm.
 */
export function ConfirmHost(): React.ReactElement {
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => subscribeConfirm(setReq), []);

  const isOpen = req !== null;

  function handleOpenChange(open: boolean): void {
    if (!open && req) resolveConfirm(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-w-sm"
        onEscapeKeyDown={() => resolveConfirm(false)}
      >
        {req ? (
          <>
            <DialogHeader>
              <DialogTitle>{req.title ?? "Подтвердите действие"}</DialogTitle>
              <DialogDescription>{req.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => resolveConfirm(false)}
              >
                {req.cancelText ?? "Отмена"}
              </Button>
              <Button
                type="button"
                variant={req.danger ? "secondary" : "primary"}
                className={req.danger ? "text-[var(--color-error)]" : ""}
                onClick={() => resolveConfirm(true)}
                autoFocus
              >
                {req.confirmText ?? (req.danger ? "Удалить" : "Подтвердить")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
