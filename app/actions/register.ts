"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";

/** Register a new user */
export async function registerAction(_prevState: { error: string | null } | null, formData: FormData) {
  const email = formData.get("email") as string;
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

  const user = await db.user.create({
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
  });

  // Create loyalty account
  await db.loyaltyAccount.create({
    data: { userId: user.id },
  });

  const {
    sendRegistrationWelcomeEmail,
    generateOutboundMessageId,
    recordOutboundEmail,
    markOutboundEmailFailed,
    markOutboundEmailSent,
    isPlausibleEmail,
  } = await import("@/lib/email");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
  const subject = "Geleoteka — добро пожаловать";
  const bodyText = `Здравствуйте, ${name}. Ваш личный кабинет готов: ${appUrl}/login`;
  const messageId = generateOutboundMessageId();
  if (isPlausibleEmail(email)) {
    await recordOutboundEmail({
      customerUserId: user.id,
      subject,
      body: bodyText,
      messageId,
    });
  }
  void sendRegistrationWelcomeEmail(
    email,
    {
      customerName: name,
      loginUrl: `${appUrl}/login`,
    },
    { messageId },
  )
    .then((result) => {
      if (!result.success) return markOutboundEmailFailed(messageId, result.error);
      return markOutboundEmailSent(messageId);
    })
    .catch((err) =>
      markOutboundEmailFailed(messageId, err instanceof Error ? err.message : String(err)),
    );

  const token = createToken({ userId: user.id, permissionRole: user.permissionRole });
  await setSessionCookie(token);

  redirect("/cabinet");
}
