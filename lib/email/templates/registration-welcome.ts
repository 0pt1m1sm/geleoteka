import { wrapEmail, type WrapEmailResult } from "./_layout";

export interface RegistrationWelcomeInput {
  customerName: string;
  loginUrl: string;
}

export interface RegistrationWelcomeOutput extends WrapEmailResult {
  subject: string;
}

export function renderRegistrationWelcome(
  input: RegistrationWelcomeInput,
): RegistrationWelcomeOutput {
  const subject = "Geleoteka — добро пожаловать";

  const { html, text } = wrapEmail({
    previewText: "Аккаунт создан — вход в личный кабинет.",
    sections: [
      {
        body: `Здравствуйте, ${input.customerName}!<br><br>Спасибо за регистрацию в Geleoteka. В личном кабинете вы видите свои заказы и записи, можете отслеживать статус работ и хранить историю обслуживания автомобиля.`,
        cta: { label: "Открыть личный кабинет", href: input.loginUrl },
      },
      {
        body: `Если письмо пришло по ошибке — просто игнорируйте его.`,
      },
    ],
  });

  return { subject, html, text };
}
