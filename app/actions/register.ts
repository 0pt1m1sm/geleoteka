"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("Unique constraint")) return true;
  return "code" in err && (err as { code?: string }).code === "P2002";
}

/** Register a new user */
export async function registerAction(_prevState: { error: string | null } | null, formData: FormData) {
  // Normalise casing/whitespace up front so the uniqueness check and the row
  // we insert both use the same canonical form the login lookup expects —
  // otherwise "User@x.ru" and "user@x.ru" create duplicate, unloginnable accounts.
  const email = ((formData.get("email") as string | null) ?? "").trim().toLowerCase();
  const phone = normalizePhone(formData.get("phone") as string);
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!email || !phone || !password || !name) {
    return { error: "Все поля обязательны" };
  }

  if (!isValidRussianPhone(phone)) {
    return { error: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX (только российские номера)" };
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

  let user: { id: string; permissionRole: string };
  try {
    user = await db.user.create({
      data: {
        email,
        phone,
        passwordHash,
        name,
        isTempPassword: false,
        // Self-registration from the public site without UTM tracking — default
        // to WALK_IN. UTM-aware attribution can override later.
        referralSource: "WALK_IN",
        customerProfile: { create: {} },
      },
      select: { id: true, permissionRole: true },
    });
  } catch (err) {
    // The findFirst check above narrows the window but doesn't close it —
    // two concurrent submits with the same email/phone can both pass it and
    // race to insert. Catch the unique-constraint violation here rather than
    // let it surface as an unhandled 500.
    if (isUniqueViolation(err)) {
      return { error: "Пользователь с таким email или телефоном уже существует" };
    }
    throw err;
  }

  // Create loyalty account
  await db.loyaltyAccount.create({
    data: { userId: user.id },
  });

  // Token persistence is awaited; provider I/O remains best-effort so a mail
  // outage never changes the long-standing immediate-login registration flow.
  try {
    const { queueEmailVerificationEmail } = await import(
      "@/lib/email-verification/send"
    );
    await queueEmailVerificationEmail({
      userId: user.id,
      email,
      customerName: name,
      reason: "registration",
    });
  } catch {
    // Keep this deliberately detail-free: verification errors must never print
    // the raw link/token captured by the sending path.
    console.error("[EMAIL VERIFICATION] registration email could not be queued");
  }

  const token = createToken({ userId: user.id, permissionRole: user.permissionRole });
  await setSessionCookie(token);

  redirect("/cabinet");
}
