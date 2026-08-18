"use client";

import { useActionState } from "react";
import {
  importPartReferencesCsv,
  type ImportReferencesState,
} from "@/app/actions/part-references";
import { AdminFormShell } from "./AdminFormShell";

/**
 * Массовый импорт справочника вставкой текста: прайс поставщика, выгрузка
 * EPC или 1С. Формат «номер;название;группа;модели» (или колонки через TAB
 * при вставке из Excel). Существующие номера не перетираются.
 */
export function PartRefImportForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState<ImportReferencesState | null, FormData>(
    importPartReferencesCsv,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <AdminFormShell error={state?.error}>
      {state && state.error === null && (
        <div className="bg-[var(--color-success-bg)] text-[var(--color-success)] px-4 py-3 rounded-lg text-sm">
          Добавлено: {state.created ?? 0}
          {state.skipped ? ` · уже были: ${state.skipped}` : ""}
        </div>
      )}
      {state?.lineErrors && state.lineErrors.length > 0 && (
        <div className="bg-[var(--color-error-bg)] p-3 rounded-lg space-y-0.5">
          {state.lineErrors.slice(0, 10).map((err, i) => (
            <p key={i} className="text-xs text-[var(--color-error)]">{err}</p>
          ))}
          {state.lineErrors.length > 10 && (
            <p className="text-xs text-[var(--color-error)]">
              …и ещё {state.lineErrors.length - 10}
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="ref-csv" className="block text-sm font-medium mb-1.5">
          Строки «номер;название;группа;модели»
        </label>
        <textarea
          id="ref-csv"
          name="csv"
          required
          className="input min-h-[140px] resize-y font-mono text-xs"
          placeholder={"A4637200346;Диск тормозной передний;Тормозная система;W463\nA0004209904;Колодки тормозные передние;Тормозная система;W463, W461"}
        />
        <p className="text-xs text-[var(--foreground-muted)] mt-1.5">
          Можно вставить колонки прямо из Excel / выгрузки 1С — табуляция тоже
          понимается. Группа и модели необязательны. Существующие номера не
          перезаписываются.
        </p>
      </div>

      <button type="submit" disabled={isPending} data-loading={isPending || undefined} aria-busy={isPending || undefined} className="btn btn-primary">
        {isPending ? "Импорт..." : "Импортировать"}
      </button>
      </AdminFormShell>
    </form>
  );
}
