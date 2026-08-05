"use client";

import { useActionState } from "react";

import { captureSeoSnapshot } from "@/app/actions/seo";
import { AdminFormShell } from "./AdminFormShell";

/**
 * «Снять замер»: техметрики сервер соберёт сам; два поля — то, что снимается
 * только руками из выдачи (site:geleoteka.ru и позиции по контрольным
 * запросам).
 */
export function SeoSnapshotForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState(captureSeoSnapshot, null);

  return (
    <form action={formAction} className="card space-y-4">
      <AdminFormShell error={state?.error}>
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
          <div>
            <label htmlFor="indexedPages" className="block text-sm font-medium mb-2">
              Страниц в индексе
            </label>
            <input
              id="indexedPages"
              name="indexedPages"
              type="number"
              min={0}
              className="input"
              placeholder="из site:geleoteka.ru"
            />
          </div>
          <div>
            <label htmlFor="note" className="block text-sm font-medium mb-2">
              Заметка (позиции, наблюдения)
            </label>
            <input
              id="note"
              name="note"
              maxLength={500}
              className="input"
              placeholder="напр.: 4-я позиция по «ремонт гелендвагена москва»"
            />
          </div>
        </div>
        <div>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? "Снимаем…" : "Снять замер"}
          </button>
        </div>
      </AdminFormShell>
    </form>
  );
}
