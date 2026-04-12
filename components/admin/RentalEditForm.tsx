"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateRentalCar, deleteRentalCar } from "@/app/actions/rentals";

interface CarData {
  id: string;
  model: string;
  year: number;
  dailyRate: number;
  description: string;
  color: string;
  plate: string;
  mileage: number;
  engine: string;
  horsepower: number;
  transmission: string;
  seats: number;
  isAvailable: boolean;
  features: string;
}

export function RentalEditForm({ car }: { car: CarData }) {
  const router = useRouter();
  const boundAction = updateRentalCar.bind(null, car.id);
  const [state, formAction, isPending] = useActionState(boundAction, null);

  async function handleDelete() {
    if (!confirm(`Удалить Mercedes-Benz ${car.model} из автопарка?`)) return;
    await deleteRentalCar(car.id);
    router.push("/admin/rentals");
  }

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error && (
        <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="model" className="block text-sm font-medium mb-2">Модель *</label>
        <input id="model" name="model" required defaultValue={car.model} className="input" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="year" className="block text-sm font-medium mb-2">Год *</label>
          <input id="year" name="year" type="number" required defaultValue={car.year} className="input" />
        </div>
        <div>
          <label htmlFor="dailyRate" className="block text-sm font-medium mb-2">Стоимость/день (₽) *</label>
          <input id="dailyRate" name="dailyRate" type="number" required defaultValue={car.dailyRate} className="input" />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-2">Описание</label>
        <textarea id="description" name="description" defaultValue={car.description} className="input min-h-[80px] resize-y" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="engine" className="block text-sm font-medium mb-2">Двигатель</label>
          <input id="engine" name="engine" defaultValue={car.engine} className="input" placeholder="4.0 V8 Biturbo" />
        </div>
        <div>
          <label htmlFor="horsepower" className="block text-sm font-medium mb-2">Мощность (л.с.)</label>
          <input id="horsepower" name="horsepower" type="number" defaultValue={car.horsepower || ""} className="input" placeholder="422" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="transmission" className="block text-sm font-medium mb-2">Коробка передач</label>
          <input id="transmission" name="transmission" defaultValue={car.transmission} className="input" placeholder="9G-TRONIC" />
        </div>
        <div>
          <label htmlFor="seats" className="block text-sm font-medium mb-2">Мест</label>
          <input id="seats" name="seats" type="number" defaultValue={car.seats} className="input" />
        </div>
      </div>

      <div>
        <label htmlFor="features" className="block text-sm font-medium mb-2">
          Комплектация <span className="text-[var(--foreground-muted)]">(одна опция на строку)</span>
        </label>
        <textarea id="features" name="features" defaultValue={car.features} className="input min-h-[140px] resize-y font-mono text-xs" placeholder="Полный привод 4MATIC&#10;Кожаный салон&#10;Панорамная крыша" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="color" className="block text-sm font-medium mb-2">Цвет</label>
          <input id="color" name="color" defaultValue={car.color} className="input" />
        </div>
        <div>
          <label htmlFor="plate" className="block text-sm font-medium mb-2">Номер</label>
          <input id="plate" name="plate" defaultValue={car.plate} className="input" />
        </div>
        <div>
          <label htmlFor="mileage" className="block text-sm font-medium mb-2">Пробег (км)</label>
          <input id="mileage" name="mileage" type="number" defaultValue={car.mileage} className="input" />
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" name="isAvailable" defaultChecked={car.isAvailable} className="w-4 h-4 accent-[var(--color-accent)]" />
        <span className="text-sm">Доступен для бронирования</span>
      </label>

      <div className="flex gap-4 pt-4 border-t border-[var(--border)]">
        <button type="button" onClick={handleDelete} className="btn btn-secondary text-sm text-[var(--color-error)]">
          Удалить
        </button>
        <div className="flex-1" />
        <Link href="/admin/rentals" className="btn btn-secondary">Отмена</Link>
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </form>
  );
}
