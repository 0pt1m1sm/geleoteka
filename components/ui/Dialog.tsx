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
          // Centering: `inset-0 m-auto` (transform-FREE) instead of the
          // classic top-1/2 + -translate-y-1/2. The translate approach broke
          // here — combined with the entry-animation keyframe's own transform
          // it double-applied and pushed the dialog ~half its height off the
          // top of the viewport on tall content. inset-0 + margin-auto centers
          // a max-height-capped box reliably with no transform involved, so
          // the animation keyframe (scale + opacity only now) can't fight it.
          //
          // Flex column + overflow-hidden: DialogHeader / DialogFooter are
          // shrink-0 (pinned bands), DialogBody is flex-1 + min-h-0 +
          // overflow-y-auto (scrolling middle). Standard modal layout.
          className={`fixed inset-0 m-auto z-50 h-fit w-[92vw] max-w-lg max-h-[90vh] flex flex-col overflow-hidden bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-2xl ${className}`.trim()}
          {...props}
        >
          {children}
          {hideCloseButton ? null : (
            <DialogPrimitive.Close className="btn-icon absolute top-3 right-3 z-[2]" aria-label="Закрыть">
              <X size={18} aria-hidden />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);

export function DialogHeader({ children, className = "" }: { children: ReactNode; className?: string }): React.ReactElement {
  // shrink-0 keeps it from compressing when body content is tall — the
  // flex column inside DialogContent gives this 'pinned at top' behaviour
  // without any sticky / negative-margin trickery.
  return (
    <div
      className={`shrink-0 flex flex-col gap-1 px-6 pt-6 pb-4 border-b border-[var(--border)] ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/**
 * Scrollable middle section of a dialog. Use between DialogHeader and
 * DialogFooter so the chrome stays pinned while only the body content
 * scrolls. flex-1 takes all remaining vertical space; overflow-y-auto
 * makes it the local scroll container.
 */
export function DialogBody({ children, className = "" }: { children: ReactNode; className?: string }): React.ReactElement {
  return (
    // min-h-0 is required — a flex item defaults to min-height:auto which
    // refuses to shrink below content size, defeating overflow-y-auto.
    <div className={`flex-1 min-h-0 overflow-y-auto px-6 py-4 ${className}`.trim()}>
      {children}
    </div>
  );
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
  // shrink-0 pins to the bottom of the flex-column DialogContent.
  return (
    <div
      className={`shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] ${className}`.trim()}
    >
      {children}
    </div>
  );
}
