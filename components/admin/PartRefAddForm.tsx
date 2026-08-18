"use client";

import { useActionState } from "react";
import { createPartReference } from "@/app/actions/part-references";
import { AdminFormShell } from "./AdminFormShell";

/** Ручное добавление одной позиции в номенклатурный справочник. */
export function PartRefAddForm(): React.ReactElement {
  const [state, formAction, isPending] = useActionState(createPartReference, null);

  return (
    <form action={formAction} className="space-y-3">
      <AdminFormShell error={state?.error}>
      {state?.success && (
        <div className="bg-[var(--color-success-bg)] text-[var(--color-success)] px-4 py-3 rounded-lg text-sm">
          Позиция сохранена в справочнике
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="ref-oem" className="block text-sm font-medium mb-1.5">Номер (OEM) *</label>
          <input id="ref-oem" name="oem" required className="input font-mono" placeholder="A4637200346" />
        </div>
        <div>
          <label htmlFor="ref-group" className="block text-sm font-medium mb-1.5">Группа / узел</label>
          <input id="ref-group" name="groupName" className="input" placeholder="Тормозная система" />
        </div>
      </div>

      <div>
        <label htmlFor="ref-name" className="block text-sm font-medium mb-1.5">Название *</label>
        <input id="ref-name" name="name" required className="input" placeholder="Диск тормозной передний G500 (W463)" />
      </div>

      <div>
        <label htmlFor="ref-models" className="block text-sm font-medium mb-1.5">Модели (через запятую)</label>
        <input id="ref-models" name="models" className="input" placeholder="W463, W461" />
      </div>

      <button type="submit" disabled={isPending} data-loading={isPending || undefined} aria-busy={isPending || undefined} className="btn btn-primary">
        {isPending ? "Сохранение..." : "Добавить в справочник"}
      </button>
      </AdminFormShell>
    </form>
  );
}
