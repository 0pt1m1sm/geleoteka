"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";
import { LOCALES, TIME_ZONES } from "@/lib/profile-options";
import { resetEmailVerificationOnChange } from "@/lib/email-verification/core";

interface Result {
  error: string | null;
  success?: boolean;
}

const NAME_MAX = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("Unique constraint")) return true;
  return "code" in err && (err as { code?: string }).code === "P2002";
}

/**
 * Изменить СВОИ данные.
 *
 * Работает от сессии и только от неё: идентификатор человека не принимается
 * параметром, поэтому подменить его в запросе невозможно. Роль, флаги и пароль
 * здесь не меняются вовсе — то, что даёт доступ, правится администратором на
 * своей странице, и объединять эти две вещи в одной форме значило бы отдать
 * повышение прав любому, кто открыл свой профиль.
 */
export async function updateOwnProfile(
  _prev: Result | null,
  formData: FormData,
): Promise<Result> {
  const session = await requireAuth();

  const name = ((formData.get("name") as string | null) ?? "").trim();
  const email = ((formData.get("email") as string | null) ?? "").trim().toLowerCase();
  const phoneRaw = ((formData.get("phone") as string | null) ?? "").trim();
  const timeZoneRaw = ((formData.get("timeZone") as string | null) ?? "").trim();
  const localeRaw = ((formData.get("locale") as string | null) ?? "").trim();

  if (!name || name.length > NAME_MAX) return { error: "Имя обязательно (до 120 символов)" };
  if (!EMAIL_RE.test(email)) return { error: "Некорректный email" };
  if (!isValidRussianPhone(phoneRaw)) {
    return { error: "Телефон в формате +7XXXXXXXXXX или 8XXXXXXXXXX" };
  }

  // Пустое значение — законный ответ «как у сервиса», а не ошибка.
  const timeZone =
    timeZoneRaw === "" ? null : (TIME_ZONES.find((z) => z.value === timeZoneRaw)?.value ?? null);
  if (timeZoneRaw !== "" && timeZone === null) return { error: "Неизвестный часовой пояс" };

  const locale = localeRaw === "" ? null : (LOCALES.find((l) => l.value === localeRaw)?.value ?? null);
  if (localeRaw !== "" && locale === null) return { error: "Неизвестный язык" };

  try {
    await db.user.update({
      where: { id: session.id },
      data: {
        name,
        email,
        phone: normalizePhone(phoneRaw),
        timeZone,
        locale,
        ...resetEmailVerificationOnChange(session.email, email),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Такой email или телефон уже занят" };
    }
    throw err;
  }

  revalidatePath("/profile");
  return { error: null, success: true };
}
