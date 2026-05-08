"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useBooking } from "./BookingProvider";
import { formatPrice } from "@/lib/utils";
import { generationLabel, trimLabel, type VehicleModel } from "@/lib/vehicle-catalog-types";

interface ServiceItem {
  id: string;
  slug: string;
  name: string;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
}

interface Props {
  services: ServiceItem[];
  models: VehicleModel[];
}

/**
 * Step 1 of the booking wizard — combined Service + Vehicle on one page.
 * Replaces the previous separate `/booking` (Services) and `/booking/step-2` (Vehicle) pages.
 *
 * - Top card: Services tile grid, multi-select. Includes "Другое" tile for "I don't know"
 *   cases (research insight: drives diagnostic-first flow without forcing customers to
 *   self-diagnose).
 * - Bottom card: Vehicle data — Model dropdown + Year + optional VIN + optional Mileage.
 *   After both Model AND Year are filled, helper text shows the model's chassis codes
 *   (e.g., "Кузов: W463 / W463A") derived from MODEL_GENERATIONS.
 */
export function Step1ServiceVehicle({ services, models }: Props): React.ReactElement {
  const { data, update } = useBooking();

  function toggleService(service: ServiceItem): void {
    const isSelected = data.serviceIds.includes(service.id);
    if (isSelected) {
      update({
        serviceIds: data.serviceIds.filter((id) => id !== service.id),
        serviceNames: data.serviceNames.filter((n) => n !== service.name),
      });
    } else {
      update({
        serviceIds: [...data.serviceIds, service.id],
        serviceNames: [...data.serviceNames, service.name],
      });
    }
  }

  const generations = data.model
    ? models.find((m) => m.name === data.model)?.generations ?? []
    : [];
  const showChassisHelper = data.model && data.year && generations.length > 0;
  // Pick the generation matching the user's year (oldest covering range wins).
  // Booking has no explicit generation picker; the year + model pair selects it.
  const yearNum = parseInt(data.year, 10);
  const matchedGeneration = Number.isFinite(yearNum)
    ? generations.find(
        (g) => yearNum >= g.yearFrom && (g.yearTo === null || yearNum <= g.yearTo),
      )
    : undefined;
  const trims = matchedGeneration?.trims ?? [];
  const showTrimPicker = Boolean(matchedGeneration) && trims.length > 0;
  const selectedTrim = trims.find((t) => t.id === data.trim);
  const canProceed =
    data.serviceIds.length >= 1 && data.model.trim() !== "" && data.year.trim() !== "";

  return (
    <div className="space-y-6">
      {/* Services card */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-1">Что вы хотите?</h2>
        <p className="text-sm text-foreground-muted mb-4">
          Выберите одну или несколько услуг. Не уверены — нажмите «Другое».
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map((service) => {
            const selected = data.serviceIds.includes(service.id);
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => toggleService(service)}
                className={`card text-left transition-all active:scale-[0.98] ${
                  selected
                    ? "border-accent bg-accent/5"
                    : "hover:border-[var(--border-hover)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-medium">{service.name}</h3>
                    {service.priceMin && (
                      <p className="text-sm text-accent mt-1">
                        от {formatPrice(service.priceMin)}
                      </p>
                    )}
                  </div>
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      selected ? "bg-accent border-accent" : "border-[var(--border)]"
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Vehicle card */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Какая машина?</h2>

        <div>
          <label htmlFor="model" className="block text-sm font-medium mb-2">
            Модель *
          </label>
          <select
            id="model"
            value={data.model}
            onChange={(e) => update({ model: e.target.value, trim: "" })}
            className="input"
          >
            <option value="">Выберите модель</option>
            {models.map((m) => (
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
              onChange={(e) => update({ year: e.target.value, trim: "" })}
              className="input"
              placeholder="2023"
              min={1990}
              max={new Date().getFullYear() + 1}
            />
            {showChassisHelper && (
              <p className="text-xs text-foreground-muted mt-1">
                Кузов: {matchedGeneration
                  ? generationLabel(matchedGeneration)
                  : "год вне известных поколений"}
              </p>
            )}
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

        <div>
          <label htmlFor="vin" className="block text-sm font-medium mb-2">
            VIN-номер <span className="text-foreground-muted">(необязательно)</span>
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
          <p className="text-xs text-foreground-muted mt-1">
            17 символов. Помогает точнее определить комплектацию.
          </p>
        </div>

        {showTrimPicker && (
          <div>
            <label htmlFor="trim" className="block text-sm font-medium mb-2">
              Вариант (двигатель / привод)
            </label>
            <select
              id="trim"
              value={data.trim}
              onChange={(e) => update({ trim: e.target.value })}
              className="input"
            >
              <option value="">Не уверен</option>
              {trims.map((t) => (
                <option key={t.id} value={t.id}>
                  {trimLabel(t)}
                </option>
              ))}
            </select>
            {selectedTrim && (
              <p className="text-xs text-foreground-muted mt-1">
                Вариант: {trimLabel(selectedTrim)}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        {canProceed ? (
          <Link href="/booking/step-2" className="btn btn-primary">
            Далее →
          </Link>
        ) : (
          <button type="button" disabled className="btn btn-primary opacity-50 cursor-not-allowed">
            Выберите услугу, модель и год
          </button>
        )}
      </div>
    </div>
  );
}
