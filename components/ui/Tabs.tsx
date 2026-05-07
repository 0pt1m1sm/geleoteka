"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

interface TabsContextValue {
  value: string;
  onValueChange: (next: string) => void;
  groupId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs.* must be inside <Tabs>");
  return ctx;
}

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className = "" }: TabsProps): React.ReactElement {
  const groupId = useId();
  return (
    <TabsContext.Provider value={{ value, onValueChange, groupId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = "", ariaLabel }: { children: ReactNode; className?: string; ariaLabel?: string }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const triggers = Array.from(ref.current.querySelectorAll<HTMLButtonElement>("[role='tab']:not([disabled])"));
    if (triggers.length === 0) return;
    const current = document.activeElement as HTMLButtonElement | null;
    const idx = triggers.indexOf(current!);
    if (idx === -1) return;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % triggers.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + triggers.length) % triggers.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = triggers.length - 1;
    else return;
    e.preventDefault();
    triggers[next].focus();
    triggers[next].click();
  }, []);

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`flex items-center gap-1 border-b border-[var(--border)] ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function TabsTrigger({ value, children, disabled, className = "" }: TabsTriggerProps): React.ReactElement {
  const { value: active, onValueChange, groupId } = useTabs();
  const isActive = active === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${groupId}-tab-${value}`}
      aria-selected={isActive}
      aria-controls={`${groupId}-panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => onValueChange(value)}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px active:opacity-70 ${
        isActive
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
      } disabled:opacity-50 ${className}`.trim()}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className = "" }: TabsContentProps): React.ReactElement | null {
  const { value: active, groupId } = useTabs();
  const isActive = active === value;
  // Auto-focus first focusable element in newly-activated panel for keyboard a11y.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // No-op; left here to allow caller to ref the panel via wrapping.
  }, [isActive]);
  if (!isActive) return null;
  return (
    <div
      ref={ref}
      role="tabpanel"
      id={`${groupId}-panel-${value}`}
      aria-labelledby={`${groupId}-tab-${value}`}
      tabIndex={0}
      className={`pt-4 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)] rounded ${className}`.trim()}
    >
      {children}
    </div>
  );
}
