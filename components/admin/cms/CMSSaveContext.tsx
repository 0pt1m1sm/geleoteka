"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Coordinates per-section "Save all" semantics for the CMS admin page.
 *
 * Each editor (CMSTextEditor / CMSRichtextEditor / CMSListEditor) registers
 * a save function on mount. CMSGroupSection's single "Save all" button calls
 * every registered save in parallel and surfaces aggregate status.
 *
 * Editors detect via `useCMSSaveSection() != null` and hide their own save
 * button when a section-level coordinator is available — preserving their
 * standalone behavior on any future page that doesn't wrap them in a
 * provider.
 */

export interface SaveResult {
  ok: boolean;
  error?: string;
  /** True only when the editor is dirty AND save was needed. */
  saved: boolean;
}

type Saver = () => Promise<SaveResult>;

interface RegisterContextValue {
  registerSaver: (key: string, saver: Saver) => () => void;
  reportDirty: (key: string, dirty: boolean) => void;
}

interface StatusContextValue {
  saving: boolean;
  error: string | null;
  savedCount: number | null;
  dirty: number;
  saveAll: () => void;
}

const CMSSaveRegisterContext = createContext<RegisterContextValue | null>(null);
const CMSSaveStatusContext = createContext<StatusContextValue | null>(null);

export function useCMSSaveSection(): RegisterContextValue | null {
  return useContext(CMSSaveRegisterContext);
}

export function useCMSSectionStatus(): StatusContextValue {
  const ctx = useContext(CMSSaveStatusContext);
  if (!ctx) throw new Error("useCMSSectionStatus must be inside CMSSaveSectionProvider");
  return ctx;
}

export function CMSSaveSectionProvider({ children }: { children: ReactNode }): React.ReactElement {
  const saversRef = useRef<Map<string, Saver>>(new Map());
  const dirtyRef = useRef<Map<string, boolean>>(new Map());
  const [dirty, setDirty] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const registerSaver = useCallback((key: string, saver: Saver): (() => void) => {
    saversRef.current.set(key, saver);
    return () => {
      saversRef.current.delete(key);
      dirtyRef.current.delete(key);
      setDirty(Array.from(dirtyRef.current.values()).filter(Boolean).length);
    };
  }, []);

  const reportDirty = useCallback((key: string, isDirty: boolean): void => {
    dirtyRef.current.set(key, isDirty);
    setDirty(Array.from(dirtyRef.current.values()).filter(Boolean).length);
    setSavedCount(null);
    setError(null);
  }, []);

  const saveAll = useCallback((): void => {
    setSaving(true);
    setError(null);
    setSavedCount(null);
    void (async () => {
      const entries = Array.from(saversRef.current.entries());
      const results = await Promise.all(entries.map(async ([key, saver]) => {
        try {
          return { key, ...(await saver()) };
        } catch (e) {
          return { key, ok: false, saved: false, error: e instanceof Error ? e.message : "Ошибка" };
        }
      }));
      const fails = results.filter((r) => !r.ok);
      const saves = results.filter((r) => r.saved && r.ok).length;
      setSaving(false);
      if (fails.length > 0) {
        setError(`Не удалось сохранить ${fails.length} ${fails.length === 1 ? "поле" : "поля"}: ${fails.map((f) => f.key).join(", ")}`);
        return;
      }
      setSavedCount(saves);
    })();
  }, []);

  return (
    <CMSSaveRegisterContext.Provider value={{ registerSaver, reportDirty }}>
      <CMSSaveStatusContext.Provider value={{ saving, error, savedCount, dirty, saveAll }}>
        {children}
      </CMSSaveStatusContext.Provider>
    </CMSSaveRegisterContext.Provider>
  );
}
