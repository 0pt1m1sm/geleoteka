"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { OAUTH_PENDING_COOKIE, verifyPendingProfile } from "@/lib/oauth-login";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";

/**
 * Завершение регистрации после входа через Яндекс/VK, когда провайдер не
 * отдал телефон и/или email. Данные провайдера приходят не из формы, а из
 * подписанной куки (15 мин) — форма дополняет только недостающее.
 */
export async function completeOAuthRegistrationAction(
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(OAUTH_PENDING_COOKIE)?.value;
  const pending = token ? verifyPendingProfile(token) : null;
  if (!pending) {
    return { error: "Сессия входа истекла. Начните вход заново." };
  }

  const { provider, profile } = pending;

  const email = (profile.email ?? (formData.get("email") as string) ?? "").trim().toLowerCase();
  const phone = normalizePhone(profile.phone ?? ((formData.get("phone") as string) ?? ""));
  const name = ((formData.get("name") as string) || profile.name).trim();

  if (!email || !email.includes("@")) {
    return { error: "Укажите корректный email" };
  }
  if (!isValidRussianPhone(phone)) {
    return { error: "Телефон должен быть российским: +7XXXXXXXXXX или 8XXXXXXXXXX" };
  }
  if (!name) {
    return { error: "Укажите имя" };
  }

  const existing = await db.user.findFirst({
    where: { OR: [{ email }, { phone }] },
    select: { id: true },
  });
  if (existing) {
    return {
      error:
        "Пользователь с таким email или телефоном уже существует. Войдите в него по паролю (или восстановите пароль по SMS) — вход через соцсеть привяжется автоматически при совпадении контактов.",
    };
  }

  const user = (await db.user.create({
    data: {
      email,
      phone,
      name,
      passwordHash: null,
      isTempPassword: false,
      referralSource: "WALK_IN",
      customerProfile: { create: {} },
      loyaltyAccount: { create: {} },
      oauthAccounts: {
        create: { provider, providerUserId: profile.providerUserId },
      },
    },
    select: { id: true, permissionRole: true },
  })) as { id: string; permissionRole: string };

  cookieStore.delete(OAUTH_PENDING_COOKIE);
  await setSessionCookie(createToken({ userId: user.id, permissionRole: user.permissionRole }));
  redirect("/cabinet");
}
