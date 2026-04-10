import { StepIndicator } from "@/components/booking/StepIndicator";
import { BookingConfirmation } from "@/components/booking/BookingConfirmation";

export default function BookingStep5() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <StepIndicator current={5} />
      <h1 className="text-display text-3xl font-bold mb-2 text-center">
        Подтверждение
      </h1>
      <p className="text-[var(--foreground-muted)] text-center mb-8">
        Проверьте данные и подтвердите запись
      </p>
      <BookingConfirmation />
    </div>
  );
}
