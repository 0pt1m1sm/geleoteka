"use client";

import { useCallback, useState, useTransition } from "react";

export interface FormActionState {
  /** True while the action is running. */
  pending: boolean;
  /** Last error message, or null. Cleared at the start of every runAction(). */
  error: string | null;
  /**
   * Manually set/clear the error. Use OUTSIDE runAction for synchronous
   * validation errors that should bail before the transition starts. Pattern:
   *
   *   setError(null);
   *   if (!isValid) { setError("..."); return; }   // bail without runAction
   *   runAction(async () => { await doStuff(); });
   *
   * Calling setError(...) and then runAction(...) without returning early
   * loses the error: runAction's first step is setError(null).
   */
  setError: (e: string | null) => void;
  /**
   * Run an async fn inside startTransition; catch errors into `error` state.
   * Clears `error` BEFORE running the fn. Caller is responsible for any
   * follow-up actions on success (e.g. router.refresh()).
   */
  runAction: (fn: () => Promise<void>) => void;
}

/**
 * Encapsulates the useTransition + try/catch + error-state pattern used by
 * admin forms (GenerationManager, ModelEditForm). The hook owns:
 * - useTransition for the pending boolean
 * - useState for the error string
 * - Try/catch wrapper that maps thrown errors to the error state
 *
 * It does NOT call router.refresh() — leave that to the caller, since some
 * mutations need it and others don't.
 */
export function useFormAction(): FormActionState {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const runAction = useCallback((fn: () => Promise<void>): void => {
    startTransition(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      }
    });
  }, []);

  return { pending, error, setError, runAction };
}
