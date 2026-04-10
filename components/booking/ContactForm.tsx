"use client";

import Link from "next/link";
import { useBooking } from "./BookingProvider";

export function ContactForm() {
  const { data, update } = useBooking();

  const canProceed =
    data.name.trim() !== "" &&
    data.phone.trim() !== "" &&
    data.email.trim() !== "";

  return (
    <div>
      <div className="card space-y-4 mb-8">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Имя *
          </label>
          <input
            id="name"
            type="text"
            value={data.name}
            onChange={(e) => update({ name: e.target.value })}
            className="input"
            placeholder="Иван Иванов"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-2">
            Телефон *
          </label>
          <input
            id="phone"
            type="tel"
            value={data.phone}
            onChange={(e) => update({ phone: e.target.value })}
            className="input"
            placeholder="+7 (999) 123-45-67"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">
            Email *
          </label>
          <input
            id="email"
            type="email"
            value={data.email}
            onChange={(e) => update({ email: e.target.value })}
            className="input"
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium mb-2">
            Примечания
          </label>
          <textarea
            id="notes"
            value={data.notes}
            onChange={(e) => update({ notes: e.target.value })}
            className="input min-h-[80px] resize-y"
            placeholder="Опишите проблему или пожелания..."
          />
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.loanerCar}
              onChange={(e) => update({ loanerCar: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--border)] accent-[var(--color-accent)]"
            />
            <span className="text-sm">Нужен подменный автомобиль</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.waitAtService}
              onChange={(e) => update({ waitAtService: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--border)] accent-[var(--color-accent)]"
            />
            <span className="text-sm">Буду ожидать в сервисе</span>
          </label>
        </div>
      </div>

      <div className="flex justify-between">
        <Link href="/booking/step-3" className="btn btn-secondary">
          ← Назад
        </Link>
        {canProceed ? (
          <Link href="/booking/step-5" className="btn btn-primary">
            Далее →
          </Link>
        ) : (
          <button type="button" disabled className="btn btn-primary opacity-50 cursor-not-allowed">
            Заполните обязательные поля
          </button>
        )}
      </div>
    </div>
  );
}
