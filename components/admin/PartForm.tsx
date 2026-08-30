"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createPart } from "@/app/actions/parts";
import { AdminFormShell } from "./AdminFormShell";
import { PartRefPicker } from "./PartRefPicker";
import { PartTrimPicker } from "./PartTrimPicker";
import { PhotoUploader } from "./PhotoUploader";
import type { VehicleModel } from "@/lib/vehicle-catalog-types";
import { PART_CONDITIONS, type PartConditionValue } from "@/lib/parts/used-part-validation";

interface Props {
  categories: { id: string; name: string }[];
  models: VehicleModel[];
  /** Предзаполнение из справочника (/admin/parts/new?ref=<id>). */
  initial?: { article?: string; name?: string; condition?: PartConditionValue };
}

export function PartForm({ categories, models, initial }: Props) {
  const [state, formAction, isPending] = useActionState(createPart, null);
  const [condition, setCondition] = useState<PartConditionValue>(initial?.condition ?? "NEW");
  const isUsed = condition !== "NEW";
  // Артикул и название управляемые: их заполняет и выбор из справочника
  // (PartRefPicker), и предзаполнение через ?ref=.
  const [article, setArticle] = useState(initial?.article ?? "");
  const [name, setName] = useState(initial?.name ?? "");

  return (
    <form action={formAction} className="card space-y-4">
      <AdminFormShell error={state?.error}>

      <PartRefPicker
        onPick={(ref) => {
          setArticle(ref.oem);
          setName(ref.name);
        }}
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="article" className="block text-sm font-medium mb-2">Артикул *</label>
          <input id="article" name="article" required value={article} onChange={(e) => setArticle(e.target.value)} className="input font-mono" placeholder="A000989690613" />
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
        <label htmlFor="name" className="block text-sm font-medium mb-2">Название в магазине *</label>
        <input id="name" name="name" required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Масло моторное Mercedes 5W-40 (5л)" />
      </div>

      <div>
        <label htmlFor="condition" className="block text-sm font-medium mb-2">Состояние *</label>
        <select
          id="condition"
          name="condition"
          className="input"
          value={condition}
          onChange={(e) => setCondition(e.target.value as PartConditionValue)}
        >
          {PART_CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {isUsed && (
          <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
            Каждый б/у экземпляр заводится отдельной позицией с остатком 1: у него
            свои фотографии, своя цена и своё место на складе. Артикул общий с
            новой деталью, торговый код будет сгенерирован автоматически.
          </p>
        )}
      </div>

      {isUsed && (
        <>
          <div>
            <label htmlFor="conditionNote" className="block text-sm font-medium mb-2">
              Состояние детали *
            </label>
            <textarea
              id="conditionNote"
              name="conditionNote"
              required
              maxLength={1000}
              className="input min-h-[80px] resize-y"
              placeholder="Потёртости на корпусе, резьба целая, следов ремонта нет"
            />
            <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
              Видно покупателю. Оценок и звёзд намеренно нет — состояние
              показывают фотографии и это описание.
            </p>
          </div>

          <div>
            <label htmlFor="originNote" className="block text-sm font-medium mb-2">
              Происхождение
            </label>
            <input
              id="originNote"
              name="originNote"
              maxLength={500}
              className="input"
              placeholder="Снята с W463 2019 г., пробег 82 000 км"
            />
          </div>
        </>
      )}

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
        <label className="block text-sm font-medium mb-2">
          Фотографии{isUsed ? " * — этой конкретной детали" : ""}
        </label>
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
