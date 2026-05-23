"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePart } from "@/app/actions/parts";
import { AdminFormShell } from "./AdminFormShell";
import { PartTrimPicker } from "./PartTrimPicker";
import { PhotoUploader } from "./PhotoUploader";
import type { VehicleModel } from "@/lib/vehicle-catalog-types";

interface PartData {
  id: string;
  article: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice: number;
  weightGrams: number | null;
  quantity: number;
  barcode: string;
  gtin: string;
  isOEM: boolean;
  isActive: boolean;
  categoryId: string;
  trimIds: string[];
  photos: string[];
}

interface Props {
  part: PartData;
  categories: { id: string; name: string }[];
  models: VehicleModel[];
}

export function PartEditForm({ part, categories, models }: Props) {
  const boundAction = updatePart.bind(null, part.id);
  const [state, formAction, isPending] = useActionState(boundAction, null);

  return (
    <form action={formAction} className="card space-y-4">
      <AdminFormShell error={state?.error}>

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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
        <div>
          <label htmlFor="weightKg" className="block text-sm font-medium mb-2">Вес (кг)</label>
          <input id="weightKg" name="weightKg" type="number" min={0} step="0.001" defaultValue={part.weightGrams ? part.weightGrams / 1000 : ""} className="input" placeholder="2.5" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="barcode" className="block text-sm font-medium mb-2">Штрихкод</label>
          <input id="barcode" name="barcode" defaultValue={part.barcode} className="input font-mono" placeholder="—" />
        </div>
        <div>
          <label htmlFor="gtin" className="block text-sm font-medium mb-2">GTIN</label>
          <input id="gtin" name="gtin" defaultValue={part.gtin} className="input font-mono" placeholder="—" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Совместимые варианты</label>
        <PartTrimPicker name="trimIds" initial={part.trimIds} models={models} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Фотографии</label>
        <PhotoUploader name="photos" initial={part.photos} />
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
        <button type="submit" disabled={isPending} data-loading={isPending || undefined} aria-busy={isPending || undefined} className="btn btn-primary">
          {isPending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
      </AdminFormShell>
    </form>
  );
}
