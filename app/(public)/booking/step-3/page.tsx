import { getDefaultContact } from "@/lib/session-defaults";
import { StepIndicator } from "@/components/booking/StepIndicator";
import { Step3ContactConfirm } from "@/components/booking/Step3ContactConfirm";

export const dynamic = "force-dynamic";

export default async function BookingStep3() {
  const defaultContact = await getDefaultContact();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <StepIndicator current={3} />
      <h1 className="text-display text-3xl font-bold mb-2 text-center">
        Контакты и подтверждение
      </h1>
      <p className="text-foreground-muted text-center mb-8">
        Шаг 3 из 3
      </p>
      <Step3ContactConfirm defaultContact={defaultContact ?? undefined} />
    </div>
  );
}
