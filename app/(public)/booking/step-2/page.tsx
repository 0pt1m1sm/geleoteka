import { StepIndicator } from "@/components/booking/StepIndicator";
import { VehicleInput } from "@/components/booking/VehicleInput";

export default function BookingStep2() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <StepIndicator current={2} />
      <h1 className="text-display text-3xl font-bold mb-2 text-center">
        Данные автомобиля
      </h1>
      <p className="text-[var(--foreground-muted)] text-center mb-8">
        Введите VIN или заполните вручную
      </p>
      <VehicleInput />
    </div>
  );
}
