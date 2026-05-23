"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createPart } from "@/app/actions/parts";
import { AdminFormShell } from "./AdminFormShell";
import { PartTrimPicker } from "./PartTrimPicker";
import { PhotoUploader } from "./PhotoUploader";
import type { VehicleModel } from "@/lib/vehicle-catalog-types";

interface Props {
  categories: { id: string; name: string }[];
  models: VehicleModel[];
}

export function PartForm({ categories, models }: Props) {
  const [state, formAction, isPending] = useActionState(createPart, null);

  return (
    <form action={formAction} className="card space-y-4">
      <AdminFormShell error={state?.error}>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="article" className="block text-sm font-medium mb-2">Артикул *</label>
          <input id="article" name="article" required className="input font-mono" placeholder="A000989690613" />
        </div>
        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium mb-2">Категория</label>
          <select id="categoryId" name="categoryId" className="input">
            <option value="">Без категории</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-2">Название *</label>
        <input id="name" name="name" required className="input" placeholder="Масло моторное Mercedes 5W-40 (5л)" />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-2">Описание</label>
        <textarea id="description" name="description" className="input min-h-[80px] resize-y" placeholder="Подробное описание..." />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label htmlFor="price" className="block text-sm font-medium mb-2">Цена (₽) *</label>
          <input id="price" name="price" type="number" required className="input" placeholder="6500" />
        </div>
        <div>
          <label htmlFor="compareAtPrice" className="block text-sm font-medium mb-2">Старая цена</label>
          <input id="compareAtPrice" name="compareAtPrice" type="number" className="input" placeholder="7500" />
        </div>
        <div>
          <label htmlFor="quantity" className="block text-sm font-medium mb-2">Кол-во</label>
          <input id="quantity" name="quantity" type="number" className="input" placeholder="25" defaultValue="0" />
        </div>
        <div>
          <label htmlFor="weightKg" className="block text-sm font-medium mb-2">Вес (кг)</label>
          <input id="weightKg" name="weightKg" type="number" min={0} step="0.001" className="input" placeholder="2.5" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Совместимые варианты</label>
        <PartTrimPicker name="trimIds" initial={[]} models={models} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Фотографии</label>
        <PhotoUploader name="photos" initial={[]} />
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" name="isOEM" defaultChecked className="w-4 h-4 accent-[var(--color-accent)]" />
        <span className="text-sm">OEM (оригинальная запчасть)</span>
      </label>

      <div className="flex gap-4 pt-2">
        <Link href="/admin/parts" className="btn btn-secondary">Отмена</Link>
        <button type="submit" disabled={isPending} data-loading={isPending || undefined} aria-busy={isPending || undefined} className="btn btn-primary">
          {isPending ? "Сохранение..." : "Добавить"}
        </button>
      </div>
      </AdminFormShell>
    </form>
  );
}
