import { formatDate, formatPrice } from "@/lib/utils";
import { wrapEmail, type WrapEmailResult } from "./_layout";

export interface RentalBookingConfirmationInput {
  customerName: string;
  vehicleSummary: string;
  startAt: Date;
  endAt: Date;
  totalDays: number;
  totalPrice: number;
  pickupAddress: string;
  managerPhone?: string;
}

export interface RentalBookingConfirmationOutput extends WrapEmailResult {
  subject: string;
}

function daysWordRu(n: number): string {
  const lastTwo = n % 100;
  const lastOne = n % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "дней";
  if (lastOne === 1) return "день";
  if (lastOne >= 2 && lastOne <= 4) return "дня";
  return "дней";
}

export function renderRentalBookingConfirmation(
  input: RentalBookingConfirmationInput,
): RentalBookingConfirmationOutput {
  const subject = "Geleoteka — бронь автомобиля подтверждена";
  const managerLine = input.managerPhone
    ? `<br><br>Контакт менеджера: <a href="tel:${input.managerPhone}" style="color:#1a1a1a">${input.managerPhone}</a>`
    : "";

  const { html, text } = wrapEmail({
    previewText: `${input.vehicleSummary} забронирован с ${formatDate(input.startAt)}.`,
    sections: [
      {
        body: `Здравствуйте, ${input.customerName}!<br><br>Бронь подтверждена. Ждём вас в указанное время.`,
      },
      {
        heading: "Бронь",
        body: `Автомобиль: <b>${input.vehicleSummary}</b><br>С: <b>${formatDate(input.startAt)}</b><br>До: <b>${formatDate(input.endAt)}</b><br>Срок: ${input.totalDays} ${daysWordRu(input.totalDays)}`,
      },
      {
        heading: "Сумма",
        body: `<div style="font-size:24px;font-weight:700;color:#d4af37">${formatPrice(input.totalPrice)}</div>`,
      },
      {
        heading: "Где забрать",
        body: `${input.pickupAddress}${managerLine}`,
      },
    ],
  });

  return { subject, html, text };
}
