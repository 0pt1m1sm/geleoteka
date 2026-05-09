"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

/**
 * Non-redirecting login used by inline checkout collision UX.
 * Verifies email + password AND that the user's phone matches the
 * provided collision phone — guards against trying random emails.
 * Returns ok/error so the caller can render the result inline.
 */
export async function loginInlineForCheckout(input: {
  email: string;
  password: string;
  /** Phone the checkout form tried — must match the matched user's phone. */
  expectedPhone: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const expectedPhone = normalizePhone(input.expectedPhone);

  if (!email || !input.password || !expectedPhone) {
    return { ok: false, error: "Email и пароль обязательны" };
  }

  const user = (await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      phone: true,
      passwordHash: true,
      permissionRole: true,
      isTempPassword: true,
    },
  })) as
    | {
        id: string;
        phone: string;
        passwordHash: string | null;
        permissionRole: string;
        isTempPassword: boolean;
      }
    | null;

  if (!user || !user.passwordHash || user.permissionRole === "NONE") {
    return { ok: false, error: "Неверный email или пароль" };
  }
  if (user.isTempPassword) {
    return { ok: false, error: "Пароль не задан. Восстановите его по SMS." };
  }
  if (user.phone !== expectedPhone) {
    return { ok: false, error: "Email не привязан к этому телефону" };
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) return { ok: false, error: "Неверный email или пароль" };

  const token = createToken({ userId: user.id, permissionRole: user.permissionRole });
  await setSessionCookie(token);
  return { ok: true };
}

/** Login */
export async function loginAction(_prevState: { error: string | null } | null, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email и пароль обязательны" };
  }

  const user = await db.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    return { error: "Неверный email или пароль" };
  }

  if (user.permissionRole === "NONE") {
    return { error: "Учётная запись не может выполнить вход" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    return { error: "Неверный email или пароль" };
  }

  const token = createToken({ userId: user.id, permissionRole: user.permissionRole });
  await setSessionCookie(token);

  if (user.permissionRole === "ADMIN" || user.permissionRole === "MANAGER") {
    redirect("/admin");
  }

  redirect("/cabinet");
}
