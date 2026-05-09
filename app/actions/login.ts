"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

interface MinimalUser {
  id: string;
  email: string;
  phone: string;
  passwordHash: string | null;
  permissionRole: string;
  isTempPassword: boolean;
}

/**
 * Look up a user by either email or phone. The identifier is heuristically
 * routed: anything containing '@' goes to email lookup, anything else is
 * normalised as a Russian phone. Lower-cases email and trims whitespace.
 * Returns null when the identifier doesn't match either field.
 */
async function findUserByIdentifier(identifierRaw: string): Promise<MinimalUser | null> {
  const identifier = identifierRaw.trim();
  if (!identifier) return null;

  const select = {
    id: true,
    email: true,
    phone: true,
    passwordHash: true,
    permissionRole: true,
    isTempPassword: true,
  } as const;

  if (identifier.includes("@")) {
    const u = (await db.user.findUnique({
      where: { email: identifier.toLowerCase() },
      select,
    })) as MinimalUser | null;
    return u;
  }

  const phone = normalizePhone(identifier);
  if (!/^\+7\d{10}$/.test(phone)) return null;
  return (await db.user.findUnique({
    where: { phone },
    select,
  })) as MinimalUser | null;
}

/**
 * Non-redirecting login used by inline checkout collision UX. The phone is
 * already known (it's the colliding one from the checkout form), so we
 * look up the user by phone and only ask for the password. Returns
 * ok/error so the caller can render the result inline.
 */
export async function loginInlineForCheckout(input: {
  password: string;
  /** Phone the checkout form tried — used as the user lookup key. */
  phone: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const phone = normalizePhone(input.phone);

  if (!phone || !input.password) {
    return { ok: false, error: "Телефон и пароль обязательны" };
  }
  if (!/^\+7\d{10}$/.test(phone)) {
    return { ok: false, error: "Некорректный телефон" };
  }

  const user = (await db.user.findUnique({
    where: { phone },
    select: {
      id: true,
      passwordHash: true,
      permissionRole: true,
      isTempPassword: true,
    },
  })) as
    | {
        id: string;
        passwordHash: string | null;
        permissionRole: string;
        isTempPassword: boolean;
      }
    | null;

  if (!user || !user.passwordHash || user.permissionRole === "NONE") {
    return { ok: false, error: "Неверный пароль" };
  }
  if (user.isTempPassword) {
    return { ok: false, error: "Пароль не задан. Восстановите его по SMS." };
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) return { ok: false, error: "Неверный пароль" };

  const token = createToken({ userId: user.id, permissionRole: user.permissionRole });
  await setSessionCookie(token);
  return { ok: true };
}

/** Login by email OR phone + password. Form field is `identifier`. */
export async function loginAction(_prevState: { error: string | null } | null, formData: FormData) {
  const identifier = formData.get("identifier") as string;
  const password = formData.get("password") as string;

  if (!identifier || !password) {
    return { error: "Email/телефон и пароль обязательны" };
  }

  const user = await findUserByIdentifier(identifier);

  if (!user || !user.passwordHash) {
    return { error: "Неверный email/телефон или пароль" };
  }

  if (user.permissionRole === "NONE") {
    return { error: "Учётная запись не может выполнить вход" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    return { error: "Неверный email/телефон или пароль" };
  }

  const token = createToken({ userId: user.id, permissionRole: user.permissionRole });
  await setSessionCookie(token);

  if (user.permissionRole === "ADMIN" || user.permissionRole === "MANAGER") {
    redirect("/admin");
  }

  redirect("/cabinet");
}
