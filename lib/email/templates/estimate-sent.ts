import { formatDate, formatPrice } from "@/lib/utils";
import { wrapEmail, type WrapEmailResult } from "./_layout";

export interface EstimateSentInput {
  customerName: string;
  estimateNumber: string;
  total: number;
  validUntil: Date | null;
  viewUrl: string;
  pdfUrl: string;
}

export interface EstimateSentOutput extends WrapEmailResult {
  subject: string;
}

export function renderEstimateSent(input: EstimateSentInput): EstimateSentOutput {
  const subject = `Geleoteka — смета №${input.estimateNumber} на согласование`;
  const validityLine = input.validUntil
    ? `Смета действительна до <b>${formatDate(input.validUntil)}</b>.`
    : "";

  const { html, text } = wrapEmail({
    previewText: `Смета №${input.estimateNumber} на ${formatPrice(input.total)} ждёт согласования.`,
    sections: [
      {
        body: `Здравствуйте, ${input.customerName}!<br><br>Мы подготовили смету по вашему обращению. Пожалуйста, ознакомьтесь с составом работ и стоимостью.`,
      },
      {
        heading: "Сумма",
        body: `<div style="font-size:24px;font-weight:700;color:#d4af37">${formatPrice(input.total)}</div>${validityLine ? `<div style="margin-top:8px;font-size:13px;color:#6b6b6b">${validityLine}</div>` : ""}`,
        cta: { label: "Открыть смету", href: input.viewUrl },
      },
      {
        body: `Если удобнее посмотреть в PDF — <a href="${input.pdfUrl}" style="color:#1a1a1a;text-decoration:underline">скачайте файл</a>.<br><br>Согласовать или отказаться можно прямо на странице сметы. По вопросам — ответьте на это письмо.`,
      },
    ],
  });

  return { subject, html, text };
}
