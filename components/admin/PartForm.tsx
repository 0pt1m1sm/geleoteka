"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createPart } from "@/app/actions/parts";
import { MODELS } from "@/lib/models-data";

interface Props {
  categories: { id: string; name: string }[];
}

export function PartForm({ categories }: Props) {
  const [state, formAction, isPending] = useActionState(createPart, null);

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {state.error}
        </div>
      )}

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

      <div className="grid grid-cols-3 gap-4">
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
      </div>

      <div>
        <label htmlFor="compatibleModels" className="block text-sm font-medium mb-2">
          Совместимые модели <span className="text-[var(--foreground-muted)]">(через запятую)</span>
        </label>
        <input id="compatibleModels" name="compatibleModels" className="input" placeholder="G-Class, GLE, S-Class" />
        <p className="text-xs text-[var(--foreground-muted)] mt-1">
          Доступные: {MODELS.map((m) => m.name).join(", ")}
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" name="isOEM" defaultChecked className="w-4 h-4 accent-[var(--color-accent)]" />
        <span className="text-sm">OEM (оригинальная запчасть)</span>
      </label>

      <div className="flex gap-4 pt-2">
        <Link href="/admin/parts" className="btn btn-secondary">Отмена</Link>
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? "Сохранение..." : "Добавить"}
        </button>
      </div>
    </form>
  );
}
