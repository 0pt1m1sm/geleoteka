"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/**
 * Drawer — Radix Dialog in drawer/sheet mode. Provides focus trap, scroll lock,
 * ESC-close, and ARIA out of the box. Two variants:
 *   - data-side="right" (default): nav drawer, slides from right
 *   - data-side="bottom": bottom sheet (e.g. mobile filters), slides from bottom
 */
export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;
export const DrawerPortal = DialogPrimitive.Portal;

export const DrawerOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DrawerOverlay({ className = "", ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in ${className}`.trim()}
      {...props}
    />
  );
});

export type DrawerSide = "right" | "left" | "bottom";

export interface DrawerContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: DrawerSide;
  /** Hide built-in close button — use DrawerClose with custom trigger inside content. */
  hideCloseButton?: boolean;
}

const SIDE_CLASSES: Record<DrawerSide, string> = {
  right:
    "right-0 top-0 h-full w-72 border-l data-[state=open]:animate-[drawer-in-right_300ms_ease-out] data-[state=closed]:animate-[drawer-out-right_220ms_ease-in]",
  left: "left-0 top-0 h-full w-72 border-r data-[state=open]:animate-[drawer-in-left_300ms_ease-out] data-[state=closed]:animate-[drawer-out-left_220ms_ease-in]",
  bottom:
    "left-0 right-0 bottom-0 max-h-[85vh] border-t rounded-t-[var(--radius-xl)] data-[state=open]:animate-[drawer-in-bottom_300ms_ease-out] data-[state=closed]:animate-[drawer-out-bottom_220ms_ease-in]",
};

export const DrawerContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DrawerContentProps>(
  function DrawerContent({ side = "right", className = "", children, hideCloseButton = false, ...props }, ref) {
    const sideClass = SIDE_CLASSES[side];
    return (
      <DrawerPortal>
        <DrawerOverlay />
        <DialogPrimitive.Content
          ref={ref}
          data-side={side}
          className={`fixed z-50 flex flex-col bg-[var(--card)] border-[var(--border)] shadow-2xl outline-none ${sideClass} ${className}`.trim()}
          {...props}
        >
          {children}
          {hideCloseButton ? null : (
            <DialogPrimitive.Close
              className="absolute top-3 right-3 p-2 rounded-[var(--radius-md)] text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)] transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)]"
              aria-label="Закрыть"
            >
              <X size={18} aria-hidden />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DrawerPortal>
    );
  },
);

export function DrawerHeader({ children, className = "" }: { children: ReactNode; className?: string }): React.ReactElement {
  return (
    <div className={`px-4 py-4 border-b border-[var(--border)] ${className}`.trim()}>{children}</div>
  );
}

export function DrawerBody({ children, className = "" }: { children: ReactNode; className?: string }): React.ReactElement {
  return <div className={`flex-1 overflow-y-auto p-4 ${className}`.trim()}>{children}</div>;
}

export function DrawerFooter({ children, className = "" }: { children: ReactNode; className?: string }): React.ReactElement {
  return (
    <div className={`p-4 space-y-2 border-t border-[var(--border)] ${className}`.trim()}>{children}</div>
  );
}

export const DrawerTitle = DialogPrimitive.Title;
export const DrawerDescription = DialogPrimitive.Description;
