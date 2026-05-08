"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";

/** Reset password with SMS code */
export async function confirmResetPasswordAction(_prevState: { error: string | null } | null, formData: FormData) {
  const phone = normalizePhone(formData.get("phone") as string);
  const code = formData.get("code") as string;
  const newPassword = formData.get("newPassword") as string;

  if (!phone || !code || !newPassword) {
    return { error: "Все поля обязательны" };
  }

  if (!isValidRussianPhone(phone)) {
    return { error: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX" };
  }

  if (newPassword.length < 6) {
    return { error: "Пароль должен быть минимум 6 символов" };
  }

  const user = await db.user.findUnique({ where: { phone } });

  if (!user) {
    return { error: "Пользователь не найден" };
  }

  const reset = await db.passwordReset.findFirst({
    where: {
      userId: user.id,
      code,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!reset) {
    return { error: "Неверный или просроченный код" };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);

  const token = createToken({ userId: user.id, permissionRole: user.permissionRole });
  await setSessionCookie(token);

  redirect("/cabinet");
}
