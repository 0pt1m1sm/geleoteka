import { StepIndicator } from "@/components/booking/StepIndicator";
import { ContactForm } from "@/components/booking/ContactForm";

export default function BookingStep4() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <StepIndicator current={4} />
      <h1 className="text-display text-3xl font-bold mb-2 text-center">
        Контактные данные
      </h1>
      <p className="text-[var(--foreground-muted)] text-center mb-8">
        Для подтверждения записи
      </p>
      <ContactForm />
    </div>
  );
}
