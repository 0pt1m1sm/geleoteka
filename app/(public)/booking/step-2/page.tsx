import { StepIndicator } from "@/components/booking/StepIndicator";
import { CalendarSlotPicker } from "@/components/booking/CalendarSlotPicker";

export default function BookingStep2() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <StepIndicator current={2} />
      <h1 className="text-display text-3xl font-bold mb-2 text-center">
        Выберите дату и время
      </h1>
      <p className="text-foreground-muted text-center mb-8">
        Шаг 2 из 3
      </p>
      <CalendarSlotPicker />
    </div>
  );
}
