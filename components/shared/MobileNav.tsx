"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "./Drawer";

export interface MobileNavProps {
  /** Brand-line content rendered in the sticky mobile header (right side, after trigger). */
  title: string;
  /** Drawer body — typically <Sidebar onNavigate={close} /> or custom nav links. */
  children: (close: () => void) => ReactNode;
  /** Optional title for screen readers (DialogTitle, visually hidden). Defaults to "Меню". */
  ariaTitle?: string;
}

/**
 * Mobile-only sticky header + drawer trigger. Replaces MobileMenu, PanelMobileNav,
 * and AdminMobileNav with one component parametrised by `children`.
 */
export function MobileNav({ title, children, ariaTitle = "Меню" }: MobileNavProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-[var(--card)] border-b border-[var(--border)]">
        <DrawerTrigger
          className="p-2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)] rounded-[var(--radius-md)]"
          aria-label="Открыть меню"
        >
          <Menu size={22} aria-hidden />
        </DrawerTrigger>
        <span className="text-sm font-semibold text-[var(--color-accent)]">{title}</span>
        <div className="w-10" aria-hidden />
      </header>
      <DrawerContent side="left">
        <DrawerTitle className="sr-only">{ariaTitle}</DrawerTitle>
        {children(close)}
      </DrawerContent>
    </Drawer>
  );
}
