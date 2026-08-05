"use client";

import { useActionState } from "react";

import { captureSeoSnapshot } from "@/app/actions/seo";
import { AdminFormShell } from "./AdminFormShell";

/**
 * Внеплановый слепок с заметкой: метрики собираются автоматически (те же,
 * что в суточном тике), заметка — место для наблюдений вроде «вышли в
 * топ-3 по аренде». Суточные слепки воркер снимает сам.
 */
export function SeoSnapshotForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState(captureSeoSnapshot, null);

  return (
    <form action={formAction} className="card">
      <AdminFormShell error={state?.error}>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label htmlFor="note" className="block text-sm font-medium mb-2">
              Заметка к внеплановому слепку
            </label>
            <input
              id="note"
              name="note"
              maxLength={500}
              className="input"
              placeholder="напр.: опубликовали 3 статьи, ждём рост"
            />
          </div>
          <button type="submit" disabled={isPending} className="btn btn-secondary shrink-0">
            {isPending ? "Снимаем…" : "Снять слепок сейчас"}
          </button>
        </div>
      </AdminFormShell>
    </form>
  );
}
