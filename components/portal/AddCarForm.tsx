"use client";

import { useActionState } from "react";
import Link from "next/link";
import { addCar } from "@/app/actions/cars";

interface Props {
  modelNames: string[];
}

export function AddCarForm({ modelNames }: Props): React.ReactElement {
  const [state, formAction, isPending] = useActionState(addCar, null);

  return (
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
          className="input font-mono tracking-wider uppercase"
          placeholder="WDD1690231J123456"
          minLength={17}
          maxLength={17}
          pattern="[A-HJ-NPR-Z0-9]{17}"
          title="VIN — 17 символов латиницей и цифрами (без I, O, Q)"
        />
      </div>

      <div>
        <label htmlFor="model" className="block text-sm font-medium mb-2">
          Модель *
        </label>
        <select id="model" name="model" required className="input">
          <option value="">Выберите модель</option>
          {modelNames.map((name) => (
            <option key={name} value={name}>
              {name}
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
            min={0}
            max={2000000}
            step={1}
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
        <button type="submit" disabled={isPending} data-loading={isPending || undefined} aria-busy={isPending || undefined} className="btn btn-primary">
          {isPending ? "Сохранение..." : "Добавить"}
        </button>
      </div>
    </form>
  );
}
