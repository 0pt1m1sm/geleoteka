"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

/** Register a new user */
export async function registerAction(_prevState: { error: string | null } | null, formData: FormData) {
  const email = formData.get("email") as string;
  const phone = normalizePhone(formData.get("phone") as string);
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!email || !phone || !password || !name) {
    return { error: "Все поля обязательны" };
  }

  if (password.length < 6) {
    return { error: "Пароль должен быть минимум 6 символов" };
  }

  const existing = await db.user.findFirst({
    where: { OR: [{ email }, { phone }] },
  });

  if (existing) {
    return { error: "Пользователь с таким email или телефоном уже существует" };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.create({
    data: { email, phone, passwordHash, name },
  });

  // Create loyalty account
  await db.loyaltyAccount.create({
    data: { userId: user.id },
  });

  const token = createToken({ userId: user.id, permissionRole: user.permissionRole });
  await setSessionCookie(token);

  redirect("/cabinet");
}
