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
  deletedAt: Date | null;
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
    deletedAt: true,
  } as const;

  let user: MinimalUser | null;
  if (identifier.includes("@")) {
    user = (await db.user.findUnique({
      where: { email: identifier.toLowerCase() },
      select,
    })) as MinimalUser | null;
  } else {
    const phone = normalizePhone(identifier);
    if (!/^\+7\d{10}$/.test(phone)) return null;
    user = (await db.user.findUnique({
      where: { phone },
      select,
    })) as MinimalUser | null;
  }

  // Soft-deleted accounts must not authenticate on any login path.
  if (user?.deletedAt) return null;
  return user;
}

/**
 * Non-redirecting login used by inline checkout collision UX. Accepts
 * either email or phone — the visitor may have an existing account
 * registered under a different phone than the one they're trying to use
 * in checkout, and we want to let them log into THAT account rather than
 * forcing them to use the colliding phone. Returns ok/error so the
 * caller can render the result inline.
 */
export async function loginInlineForCheckout(input: {
  identifier: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.identifier || !input.password) {
    return { ok: false, error: "Email/телефон и пароль обязательны" };
  }

  const user = await findUserByIdentifier(input.identifier);

  if (!user || !user.passwordHash || user.permissionRole === "NONE") {
    return { ok: false, error: "Неверный email/телефон или пароль" };
  }
  if (user.isTempPassword) {
    return { ok: false, error: "Пароль не задан. Восстановите его по SMS." };
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) return { ok: false, error: "Неверный email/телефон или пароль" };

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

  // Temp/guest passwords aren't real credentials — mirror the guard already
  // enforced in loginInlineForCheckout so the main form can't bypass it.
  if (user.isTempPassword) {
    return { error: "Пароль не задан. Восстановите его по SMS." };
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

  if (user.permissionRole === "WAREHOUSE_WORKER") {
    redirect("/admin/warehouse");
  }

  redirect("/cabinet");
}
