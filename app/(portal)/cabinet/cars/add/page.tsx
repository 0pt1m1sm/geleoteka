"use client";

import { useActionState } from "react";
import Link from "next/link";
import { addCar } from "@/app/actions/cars";
import { MODELS } from "@/lib/models-data";

export default function AddCarPage() {
  const [state, formAction, isPending] = useActionState(addCar, null);

  return (
    <div className="max-w-lg">
      <h1 className="text-display text-2xl font-bold mb-6">
        Добавить автомобиль
      </h1>

      <form action={formAction} className="card space-y-4">
        {state?.error && (
          <div className="bg-[var(--color-error-bg)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm">
            {state.error}
          </div>
        )}

        <div>
          <label htmlFor="vin" className="block text-sm font-medium mb-2">
            VIN-номер
          </label>
          <input
            id="vin"
            name="vin"
            type="text"
            className="input font-mono tracking-wider"
            placeholder="WDD1690231J123456"
            maxLength={17}
          />
        </div>

        <div>
          <label htmlFor="model" className="block text-sm font-medium mb-2">
            Модель *
          </label>
          <select id="model" name="model" required className="input">
            <option value="">Выберите модель</option>
            {MODELS.map((m) => (
              <option key={m.slug} value={m.name}>
                {m.name}
              </option>
            ))}
            <option value="Другая">Другая модель</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="year" className="block text-sm font-medium mb-2">
              Год выпуска *
            </label>
            <input
              id="year"
              name="year"
              type="number"
              required
              className="input"
              placeholder="2023"
              min={1990}
              max={new Date().getFullYear() + 1}
            />
          </div>
          <div>
            <label htmlFor="mileage" className="block text-sm font-medium mb-2">
              Пробег, км
            </label>
            <input
              id="mileage"
              name="mileage"
              type="number"
              className="input"
              placeholder="45000"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="color" className="block text-sm font-medium mb-2">
              Цвет
            </label>
            <input
              id="color"
              name="color"
              type="text"
              className="input"
              placeholder="Чёрный"
            />
          </div>
          <div>
            <label htmlFor="plate" className="block text-sm font-medium mb-2">
              Госномер
            </label>
            <input
              id="plate"
              name="plate"
              type="text"
              className="input"
              placeholder="А123БВ777"
            />
          </div>
        </div>

        <div className="flex gap-4 pt-2">
          <Link href="/cabinet/cars" className="btn btn-secondary">
            Отмена
          </Link>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? "Сохранение..." : "Добавить"}
          </button>
        </div>
      </form>
    </div>
  );
}
