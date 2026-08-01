import { wrapEmail, type WrapEmailResult } from "./_layout";

export interface RegistrationWelcomeInput {
  customerName: string;
  loginUrl: string;
  verificationUrl: string;
}

export interface RegistrationWelcomeOutput extends WrapEmailResult {
  subject: string;
}

export function renderRegistrationWelcome(
  input: RegistrationWelcomeInput,
): RegistrationWelcomeOutput {
  const subject = "Geleoteka — добро пожаловать";

  const { html, text } = wrapEmail({
    previewText: "Аккаунт создан — подтвердите адрес электронной почты.",
    sections: [
      {
        body: `Здравствуйте, ${input.customerName}!<br><br>Спасибо за регистрацию в Geleoteka. В личном кабинете вы видите свои заказы и записи, можете отслеживать статус работ и хранить историю обслуживания автомобиля.`,
      },
      {
        heading: "Подтверждение email",
        body: "Подтвердите адрес электронной почты. Ссылка действует 24 часа. Доступ к личному кабинету уже открыт и от подтверждения не зависит.",
        cta: { label: "Подтвердить email", href: input.verificationUrl },
      },
      {
        body: `Личный кабинет: ${input.loginUrl}`,
      },
      {
        body: `Если письмо пришло по ошибке — просто игнорируйте его.`,
      },
    ],
  });

  return { subject, html, text };
}
