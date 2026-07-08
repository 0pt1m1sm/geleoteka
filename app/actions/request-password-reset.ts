"use server";

import { db } from "@/lib/db";
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

  // Анти-флуд: SMS платные и лимитированы оператором — не чаще одного кода
  // в минуту на аккаунт. Возвращаем error (а не success), чтобы владелец
  // номера понимал, почему код не пришёл повторно.
  const recent = (await db.passwordReset.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 1000) } },
    select: { id: true },
  })) as { id: string } | null;
  if (recent) {
    return { error: "Код уже отправлен. Повторная отправка — через минуту." };
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.passwordReset.create({
    data: { userId: user.id, code, expiresAt },
  });

  // Без ключей SMSC уходит в mock (код виден в серверном логе) — флоу
  // остаётся проверяемым до активации интеграции.
  await sendSms(phone, `Geleoteka: код восстановления пароля ${code}. Действует 15 минут.`);

  return { success: true };
}
