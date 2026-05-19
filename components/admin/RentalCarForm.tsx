"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createRentalCar } from "@/app/actions/rentals";
import { PhotoUploader } from "./PhotoUploader";

export function RentalCarForm() {
  const [state, formAction, isPending] = useActionState(createRentalCar, null);

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="model" className="block text-sm font-medium mb-2">Модель *</label>
        <input id="model" name="model" required className="input" placeholder="G 500" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="year" className="block text-sm font-medium mb-2">Год *</label>
          <input id="year" name="year" type="number" required className="input" placeholder="2024" />
        </div>
        <div>
          <label htmlFor="dailyRate" className="block text-sm font-medium mb-2">Стоимость/день (₽) *</label>
          <input id="dailyRate" name="dailyRate" type="number" required className="input" placeholder="35000" />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-2">Описание</label>
        <textarea id="description" name="description" className="input min-h-[80px] resize-y" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="engine" className="block text-sm font-medium mb-2">Двигатель</label>
          <input id="engine" name="engine" className="input" placeholder="4.0 V8 Biturbo" />
        </div>
        <div>
          <label htmlFor="horsepower" className="block text-sm font-medium mb-2">Мощность (л.с.)</label>
          <input id="horsepower" name="horsepower" type="number" className="input" placeholder="422" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="transmission" className="block text-sm font-medium mb-2">Коробка передач</label>
          <input id="transmission" name="transmission" className="input" placeholder="9G-TRONIC" />
        </div>
        <div>
          <label htmlFor="seats" className="block text-sm font-medium mb-2">Мест</label>
          <input id="seats" name="seats" type="number" className="input" defaultValue={5} />
        </div>
      </div>

      <div>
        <label htmlFor="features" className="block text-sm font-medium mb-2">
          Комплектация <span className="text-[var(--foreground-muted)]">(одна опция на строку)</span>
        </label>
        <textarea
          id="features"
          name="features"
          className="input min-h-[140px] resize-y font-mono text-xs"
          placeholder="Полный привод 4MATIC&#10;Кожаный салон&#10;Панорамная крыша"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="color" className="block text-sm font-medium mb-2">Цвет</label>
          <input id="color" name="color" className="input" placeholder="Чёрный" />
        </div>
        <div>
          <label htmlFor="plate" className="block text-sm font-medium mb-2">Номер</label>
          <input id="plate" name="plate" className="input" placeholder="А123БВ777" />
        </div>
        <div>
          <label htmlFor="mileage" className="block text-sm font-medium mb-2">Пробег (км)</label>
          <input id="mileage" name="mileage" type="number" className="input" placeholder="12000" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Фотографии</label>
        <PhotoUploader name="photos" initial={[]} />
      </div>

      <div className="flex gap-4 pt-2">
        <Link href="/admin/rentals" className="btn btn-secondary">Отмена</Link>
        <button type="submit" disabled={isPending} data-loading={isPending || undefined} aria-busy={isPending || undefined} className="btn btn-primary">
          {isPending ? "Сохранение..." : "Добавить"}
        </button>
      </div>
    </form>
  );
}
