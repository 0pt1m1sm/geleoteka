"use client";

import Link from "next/link";
import { useBooking } from "./BookingProvider";
import { MODELS } from "@/lib/models-data";

export function VehicleInput() {
  const { data, update } = useBooking();

  const canProceed = data.model.trim() !== "" && data.year.trim() !== "";

  return (
    <div>
      <div className="card space-y-4 mb-8">
        <div>
          <label htmlFor="vin" className="block text-sm font-medium mb-2">
            VIN-номер <span className="text-[var(--foreground-muted)]">(необязательно)</span>
          </label>
          <input
            id="vin"
            type="text"
            value={data.vin}
            onChange={(e) => update({ vin: e.target.value.toUpperCase() })}
            className="input font-mono tracking-wider"
            placeholder="WDD1690231J123456"
            maxLength={17}
          />
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            17 символов. Помогает точнее определить комплектацию.
          </p>
        </div>

        <div>
          <label htmlFor="model" className="block text-sm font-medium mb-2">
            Модель *
          </label>
          <select
            id="model"
            value={data.model}
            onChange={(e) => update({ model: e.target.value })}
            className="input"
          >
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
              type="number"
              value={data.year}
              onChange={(e) => update({ year: e.target.value })}
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
              type="number"
              value={data.mileage}
              onChange={(e) => update({ mileage: e.target.value })}
              className="input"
              placeholder="45000"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <Link href="/booking" className="btn btn-secondary">
          ← Назад
        </Link>
        {canProceed ? (
          <Link href="/booking/step-3" className="btn btn-primary">
            Далее →
          </Link>
        ) : (
          <button type="button" disabled className="btn btn-primary opacity-50 cursor-not-allowed">
            Укажите модель и год
          </button>
        )}
      </div>
    </div>
  );
}
