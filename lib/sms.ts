import "server-only";
import { getSetting } from "@/lib/settings";

interface SmsSendResult {
  success: boolean;
  error?: string;
}

/**
 * SMS via smsc.ru. Credentials are resolved per call through `getSetting`
 * (DB override at /admin/settings/integrations, falls back to env vars).
 * `getSetting` caches with 60s TTL so per-call overhead is negligible.
 * Without credentials we mock — booking/status flows continue to work.
 */
export async function sendSms(
  phone: string,
  message: string,
): Promise<SmsSendResult> {
  const login = await getSetting("SMSC_LOGIN");
  const psw = await getSetting("SMSC_PASSWORD");

  if (!login || !psw) {
    console.log(`[SMS MOCK] To: ${phone} | Message: ${message}`);
    return { success: true };
  }

  try {
    const params = new URLSearchParams({
      login,
      psw,
      phones: phone,
      mes: message,
      fmt: "3", // JSON response
      charset: "utf-8",
      sender: "Geleoteka",
    });

    const res = await fetch(`https://smsc.ru/sys/send.php?${params.toString()}`);
    const data = (await res.json()) as { error?: string };

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
  timeStr: string,
): Promise<SmsSendResult> {
  return sendSms(
    phone,
    `Geleoteka: Ваша запись подтверждена на ${dateStr} в ${timeStr}. Ждём вас! Тел: +7(963)768-06-42`,
  );
}

export async function sendStatusChange(
  phone: string,
  statusLabel: string,
): Promise<SmsSendResult> {
  return sendSms(
    phone,
    `Geleoteka: Статус вашего заказа: ${statusLabel}. Подробности в личном кабинете.`,
  );
}

export async function sendEstimateReady(phone: string): Promise<SmsSendResult> {
  return sendSms(
    phone,
    `Geleoteka: Смета на обслуживание готова. Откройте личный кабинет для согласования.`,
  );
}

export async function sendReminder(
  phone: string,
  dateStr: string,
  timeStr: string,
  daysBefore: number,
): Promise<SmsSendResult> {
  const prefix = daysBefore === 0 ? "Сегодня" : "Завтра";
  return sendSms(
    phone,
    `Geleoteka: ${prefix} у вас запись на ${timeStr}. Ждём вас по адресу: Химки, Пролетарская ул., 18к1. Тел: +7(963)768-06-42`,
  );
}
