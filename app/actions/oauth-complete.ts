"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { OAUTH_PENDING_COOKIE, verifyPendingProfile } from "@/lib/oauth-login";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("Unique constraint")) return true;
  return "code" in err && (err as { code?: string }).code === "P2002";
}

/**
 * Завершение регистрации после входа через Яндекс/VK, когда провайдер не
 * отдал телефон и/или email. Данные провайдера приходят не из формы, а из
 * подписанной куки (15 мин) — форма дополняет только недостающее.
 */
export async function completeOAuthRegistrationAction(
  _prevState: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  // Через шов изоляции: арендатор проставляется в данные и в условие.
  const db = await tenantDb();
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

  let user: { id: string; permissionRole: string };
  try {
    user = (await db.user.create({
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
  } catch (err) {
    // The findFirst check above narrows the window but doesn't close it —
    // two concurrent OAuth completions with the same email/phone can both
    // pass it and race to insert. Catch the unique-constraint violation here
    // rather than let it surface as an unhandled 500.
    if (isUniqueViolation(err)) {
      return {
        error:
          "Пользователь с таким email или телефоном уже существует. Войдите в него по паролю (или восстановите пароль по SMS) — вход через соцсеть привяжется автоматически при совпадении контактов.",
      };
    }
    throw err;
  }

  cookieStore.delete(OAUTH_PENDING_COOKIE);
  await setSessionCookie(createToken({ userId: user.id, permissionRole: user.permissionRole }));
  redirect("/cabinet");
}
