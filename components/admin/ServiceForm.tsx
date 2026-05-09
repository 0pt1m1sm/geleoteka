"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createService, updateService } from "@/app/actions/services";
import { AdminFormShell } from "./AdminFormShell";

interface InitialService {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
}

interface Props {
  initial?: InitialService;
}

export function ServiceForm({ initial }: Props): React.ReactElement {
  const action = initial
    ? updateService.bind(null, initial.id)
    : createService;
  const [state, formAction, isPending] = useActionState(action, null);
  const isEditing = !!initial;

  return (
    <form action={formAction} className="card space-y-4">
      <AdminFormShell error={state?.error}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">Название *</label>
            <input
              id="name"
              name="name"
              required
              maxLength={120}
              className="input"
              placeholder="Замена масла"
              defaultValue={initial?.name ?? ""}
            />
          </div>
          <div>
            <label htmlFor="slug" className="block text-sm font-medium mb-2">Slug *</label>
            <input
              id="slug"
              name="slug"
              required
              pattern="[a-z0-9-]+"
              title="Только латиница, цифры и дефисы"
              className="input font-mono"
              placeholder="oil-change"
              defaultValue={initial?.slug ?? ""}
            />
          </div>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-2">Описание</label>
          <textarea
            id="description"
            name="description"
            className="input min-h-[120px] resize-y"
            placeholder="Что входит в услугу, особенности, на каких моделях выполняется..."
            defaultValue={initial?.description ?? ""}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="priceMin" className="block text-sm font-medium mb-2">Цена от (₽)</label>
            <input
              id="priceMin"
              name="priceMin"
              type="number"
              min={0}
              className="input"
              placeholder="5000"
              defaultValue={initial?.priceMin ?? ""}
            />
          </div>
          <div>
            <label htmlFor="priceMax" className="block text-sm font-medium mb-2">Цена до (₽)</label>
            <input
              id="priceMax"
              name="priceMax"
              type="number"
              min={0}
              className="input"
              placeholder="15000"
              defaultValue={initial?.priceMax ?? ""}
            />
          </div>
          <div>
            <label htmlFor="durationMinutes" className="block text-sm font-medium mb-2">Длительность (мин)</label>
            <input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min={0}
              step={15}
              className="input"
              placeholder="60"
              defaultValue={initial?.durationMinutes ?? ""}
            />
          </div>
        </div>

        <div className="flex gap-4 pt-2">
          <Link href="/admin/services" className="btn btn-secondary">Отмена</Link>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? "Сохранение..." : isEditing ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </AdminFormShell>
    </form>
  );
}
