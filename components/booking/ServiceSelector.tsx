"use client";

import Link from "next/link";
import { useBooking } from "./BookingProvider";
import { formatPrice } from "@/lib/utils";

interface ServiceItem {
  id: string;
  slug: string;
  name: string;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
}

export function ServiceSelector({ services }: { services: ServiceItem[] }) {
  const { data, update } = useBooking();

  function toggle(service: ServiceItem) {
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

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {services.map((service) => {
          const selected = data.serviceIds.includes(service.id);
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => toggle(service)}
              className={`card text-left transition-all ${
                selected
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                  : "hover:border-[var(--border-hover)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="font-medium">{service.name}</h3>
                  {service.priceMin && (
                    <p className="text-sm text-[var(--color-accent)] mt-1">
                      от {formatPrice(service.priceMin)}
                    </p>
                  )}
                  {service.durationMinutes && (
                    <p className="text-xs text-[var(--foreground-muted)] mt-1">
                      ~{service.durationMinutes >= 60
                        ? `${Math.floor(service.durationMinutes / 60)} ч`
                        : `${service.durationMinutes} мин`}
                    </p>
                  )}
                </div>
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    selected
                      ? "bg-[var(--color-accent)] border-[var(--color-accent)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  {selected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        {data.serviceIds.length > 0 ? (
          <Link href="/booking/step-2" className="btn btn-primary">
            Далее →
          </Link>
        ) : (
          <button type="button" disabled className="btn btn-primary opacity-50 cursor-not-allowed">
            Выберите хотя бы одну услугу
          </button>
        )}
      </div>
    </div>
  );
}
