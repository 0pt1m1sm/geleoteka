"use server";

import { db } from "@/lib/db";
import {
  issuePasswordResetCode,
  type PasswordResetDb,
} from "@/lib/password-reset/core";
import { sendSms } from "@/lib/sms";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";

type ActionState =
  | { error: string | null }
  | { success: true }
  | null;

/** Request password reset — sends SMS code */
export async function requestPasswordResetAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const phone = normalizePhone(formData.get("phone") as string);

  if (!phone) {
    return { error: "Телефон обязателен" };
  }
  if (!isValidRussianPhone(phone)) {
    return { error: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX" };
  }

  const user = await db.user.findUnique({ where: { phone } });

  if (!user) {
    return { success: true };
  }

  const issued = await issuePasswordResetCode(
    db as unknown as PasswordResetDb,
    { userId: user.id },
  );
  if (issued.status === "rate_limited") {
    return { error: "Код уже отправлен. Повторная отправка — через минуту." };
  }

  // Без ключей SMSC уходит в mock (код виден в серверном логе) — флоу
  // остаётся проверяемым до активации интеграции.
  await sendSms(
    phone,
    `Geleoteka: код восстановления пароля ${issued.code}. Действует 15 минут.`,
  );

  return { success: true };
}
