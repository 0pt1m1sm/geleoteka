const SMSC_LOGIN = process.env.SMSC_LOGIN;
const SMSC_PASSWORD = process.env.SMSC_PASSWORD;
const SMSC_ENABLED = !!(SMSC_LOGIN && SMSC_PASSWORD);

interface SmsSendResult {
  success: boolean;
  error?: string;
}

export async function sendSms(
  phone: string,
  message: string
): Promise<SmsSendResult> {
  if (!SMSC_ENABLED) {
    console.log(`[SMS MOCK] To: ${phone} | Message: ${message}`);
    return { success: true };
  }

  try {
    const params = new URLSearchParams({
      login: SMSC_LOGIN!,
      psw: SMSC_PASSWORD!,
      phones: phone,
      mes: message,
      fmt: "3", // JSON response
      charset: "utf-8",
      sender: "Geleoteka",
    });

    const res = await fetch(`https://smsc.ru/sys/send.php?${params.toString()}`);
    const data = await res.json();

    if (data.error) {
      console.error("[SMS ERROR]", data.error);
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (err) {
    console.error("[SMS ERROR]", err);
    return { success: false, error: "Network error" };
  }
}

export async function sendBookingConfirmation(
  phone: string,
  dateStr: string,
  timeStr: string
): Promise<SmsSendResult> {
  return sendSms(
    phone,
    `Geleoteka: Ваша запись подтверждена на ${dateStr} в ${timeStr}. Ждём вас! Тел: +7(495)123-45-67`
  );
}

export async function sendStatusChange(
  phone: string,
  statusLabel: string
): Promise<SmsSendResult> {
  return sendSms(
    phone,
    `Geleoteka: Статус вашего заказа: ${statusLabel}. Подробности в личном кабинете.`
  );
}

export async function sendEstimateReady(
  phone: string
): Promise<SmsSendResult> {
  return sendSms(
    phone,
    `Geleoteka: Смета на обслуживание готова. Откройте личный кабинет для согласования.`
  );
}

export async function sendReminder(
  phone: string,
  dateStr: string,
  timeStr: string,
  daysBefore: number
): Promise<SmsSendResult> {
  const prefix = daysBefore === 0 ? "Сегодня" : "Завтра";
  return sendSms(
    phone,
    `Geleoteka: ${prefix} у вас запись на ${timeStr}. Ждём вас по адресу: ул. Примерная, 15. Тел: +7(495)123-45-67`
  );
}
