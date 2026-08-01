import { wrapEmail, type WrapEmailResult } from "./_layout";

export interface EmailVerificationInput {
  customerName: string;
  verificationUrl: string;
}

export interface EmailVerificationOutput extends WrapEmailResult {
  subject: string;
}

export function renderEmailVerification(
  input: EmailVerificationInput,
): EmailVerificationOutput {
  const subject = "Geleoteka — подтвердите email";
  const { html, text } = wrapEmail({
    previewText: "Подтвердите адрес электронной почты.",
    sections: [
      {
        body: `Здравствуйте, ${input.customerName}!<br><br>Подтвердите адрес электронной почты для аккаунта Geleoteka. Ссылка действует 24 часа.`,
        cta: { label: "Подтвердить email", href: input.verificationUrl },
      },
      {
        body: "Подтверждение не ограничивает вход или использование сервиса. Если вы не запрашивали письмо, просто игнорируйте его.",
      },
    ],
  });

  return { subject, html, text };
}
