"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";

/** Login */
export async function loginAction(_prevState: { error: string | null } | null, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email и пароль обязательны" };
  }

  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    return { error: "Неверный email или пароль" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    return { error: "Неверный email или пароль" };
  }

  const token = createToken({ userId: user.id, role: user.role });
  await setSessionCookie(token);

  if (user.role === "ADMIN" || user.role === "MANAGER") {
    redirect("/admin");
  }

  redirect("/cabinet");
}
