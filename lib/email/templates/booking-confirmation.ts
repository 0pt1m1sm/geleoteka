import { formatDateTime } from "@/lib/utils";
import { wrapEmail, type WrapEmailResult } from "./_layout";

export interface BookingConfirmationInput {
  customerName: string;
  dateTime: Date;
  vehicleSummary: string;
  services: string[];
  managerName?: string;
  managerPhone?: string;
  address: string;
}

export interface BookingConfirmationOutput extends WrapEmailResult {
  subject: string;
}

export function renderBookingConfirmation(
  input: BookingConfirmationInput,
): BookingConfirmationOutput {
  const slotLabel = formatDateTime(input.dateTime);
  const subject = `Geleoteka — запись на ${slotLabel}`;
  const servicesList = input.services.length
    ? input.services.map((s) => `• ${s}`).join("<br>")
    : "—";
  const managerLine =
    input.managerName || input.managerPhone
      ? `<br>Менеджер: ${[input.managerName, input.managerPhone].filter(Boolean).join(", ")}`
      : "";

  const { html, text } = wrapEmail({
    previewText: `Ваша запись на ${slotLabel} подтверждена.`,
    sections: [
      {
        body: `Здравствуйте, ${input.customerName}!<br><br>Спасибо за обращение в Geleoteka. Ваша запись на сервис подтверждена.`,
      },
      {
        heading: "Запись",
        body: `Дата и время: <b>${slotLabel}</b><br>Автомобиль: ${input.vehicleSummary}<br><br>Услуги:<br>${servicesList}`,
      },
      {
        heading: "Куда подъехать",
        body: `${input.address}${managerLine}`,
      },
      {
        body: `Если планы изменятся — напишите ответом на это письмо или позвоните по номеру выше.`,
      },
    ],
  });

  return { subject, html, text };
}
