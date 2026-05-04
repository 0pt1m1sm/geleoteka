import { StepIndicator } from "@/components/booking/StepIndicator";
import { Step3ContactConfirm } from "@/components/booking/Step3ContactConfirm";

export default function BookingStep3() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <StepIndicator current={3} />
      <h1 className="text-display text-3xl font-bold mb-2 text-center">
        Контакты и подтверждение
      </h1>
      <p className="text-foreground-muted text-center mb-8">
        Шаг 3 из 3
      </p>
      <Step3ContactConfirm />
    </div>
  );
}
