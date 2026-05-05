"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePart } from "@/app/actions/parts";

interface PartData {
  id: string;
  article: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice: number;
  quantity: number;
  isOEM: boolean;
  isActive: boolean;
  categoryId: string;
  compatibleModels: string;
}

interface Props {
  part: PartData;
  categories: { id: string; name: string }[];
  modelNames: string[];
}

export function PartEditForm({ part, categories, modelNames }: Props) {
  const boundAction = updatePart.bind(null, part.id);
  const [state, formAction, isPending] = useActionState(boundAction, null);

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Артикул</label>
          <input value={part.article} disabled className="input font-mono opacity-60" />
        </div>
        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium mb-2">Категория</label>
          <select id="categoryId" name="categoryId" defaultValue={part.categoryId} className="input">
            <option value="">Без категории</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-2">Название *</label>
        <input id="name" name="name" required defaultValue={part.name} className="input" />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-2">Описание</label>
        <textarea id="description" name="description" defaultValue={part.description} className="input min-h-[80px] resize-y" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="price" className="block text-sm font-medium mb-2">Цена (₽) *</label>
          <input id="price" name="price" type="number" required defaultValue={part.price} className="input" />
        </div>
        <div>
          <label htmlFor="compareAtPrice" className="block text-sm font-medium mb-2">Старая цена</label>
          <input id="compareAtPrice" name="compareAtPrice" type="number" defaultValue={part.compareAtPrice || ""} className="input" />
        </div>
        <div>
          <label htmlFor="quantity" className="block text-sm font-medium mb-2">Кол-во</label>
          <input id="quantity" name="quantity" type="number" defaultValue={part.quantity} className="input" />
        </div>
      </div>

      <div>
        <label htmlFor="compatibleModels" className="block text-sm font-medium mb-2">Совместимые модели</label>
        <input id="compatibleModels" name="compatibleModels" defaultValue={part.compatibleModels} className="input" />
        <p className="text-xs text-[var(--foreground-muted)] mt-1">
          {modelNames.join(", ")}
        </p>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" name="isOEM" defaultChecked={part.isOEM} className="w-4 h-4 accent-[var(--color-accent)]" />
          <span className="text-sm">OEM</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" name="isActive" defaultChecked={part.isActive} className="w-4 h-4 accent-[var(--color-accent)]" />
          <span className="text-sm">Активна</span>
        </label>
      </div>

      <div className="flex gap-4 pt-2">
        <Link href="/admin/parts" className="btn btn-secondary">Отмена</Link>
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </form>
  );
}
