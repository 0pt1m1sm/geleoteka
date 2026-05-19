"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/**
 * Dialog primitive — Radix wrapper themed for the brand.
 * Provides focus trap, scroll lock, ESC-to-close, and ARIA out of the box.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className = "", ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-dialog-overlay
      className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-sm ${className}`.trim()}
      {...props}
    />
  );
});

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Hide the default close button (use DialogClose with custom trigger instead). */
  hideCloseButton?: boolean;
}

export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  function DialogContent({ className = "", children, hideCloseButton = false, ...props }, ref) {
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          data-dialog-content
          className={`fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg max-h-[90vh] overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-2xl p-6 ${className}`.trim()}
          {...props}
        >
          {children}
          {hideCloseButton ? null : (
            <DialogPrimitive.Close className="btn-icon absolute top-3 right-3" aria-label="Закрыть">
              <X size={18} aria-hidden />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);

export function DialogHeader({ children, className = "" }: { children: ReactNode; className?: string }): React.ReactElement {
  return <div className={`flex flex-col gap-1 mb-4 ${className}`.trim()}>{children}</div>;
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className = "", ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={`text-lg font-semibold ${className}`.trim()}
      {...props}
    />
  );
});

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className = "", ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={`text-sm text-[var(--foreground-muted)] ${className}`.trim()}
      {...props}
    />
  );
});

export function DialogFooter({ children, className = "" }: { children: ReactNode; className?: string }): React.ReactElement {
  return (
    <div className={`flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[var(--border)] ${className}`.trim()}>
      {children}
    </div>
  );
}
