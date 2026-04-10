import { StepIndicator } from "@/components/booking/StepIndicator";
import { CalendarSlotPicker } from "@/components/booking/CalendarSlotPicker";

export default function BookingStep3() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <StepIndicator current={3} />
      <h1 className="text-display text-3xl font-bold mb-2 text-center">
        Выберите дату и время
      </h1>
      <p className="text-[var(--foreground-muted)] text-center mb-8">
        Доступные слоты обновляются в реальном времени
      </p>
      <CalendarSlotPicker />
    </div>
  );
}
