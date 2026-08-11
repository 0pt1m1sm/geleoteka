"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { clearSessionCookie, createToken, requireAuth, setSessionCookie } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
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
  const phone = normalizePhone(phoneRaw);
  if (!isValidRussianPhone(phone)) {
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
        phone,
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

const PASSWORD_MIN = 6;

/**
 * Сменить СВОЙ пароль, зная текущий.
 *
 * Гостевые аккаунты (isTempPassword) и учётки без хэша сюда не пускаются:
 * их «текущий пароль» человеку неизвестен в принципе, честный маршрут для
 * них — восстановление по SMS. Требование текущего пароля защищает от
 * захвата аккаунта через оставленную открытой сессию.
 */
export async function changeOwnPassword(
  _prev: Result | null,
  formData: FormData,
): Promise<Result> {
  const session = await requireAuth();

  const current = ((formData.get("currentPassword") as string | null) ?? "").trim();
  const next = ((formData.get("newPassword") as string | null) ?? "").trim();
  const repeat = ((formData.get("repeatPassword") as string | null) ?? "").trim();

  if (!current || !next || !repeat) return { error: "Все поля обязательны" };
  if (next.length < PASSWORD_MIN) {
    return { error: `Новый пароль должен быть минимум ${PASSWORD_MIN} символов` };
  }
  if (next !== repeat) return { error: "Новый пароль и повтор не совпадают" };
  if (next === current) return { error: "Новый пароль совпадает с текущим" };

  const user = (await db.user.findUnique({
    where: { id: session.id },
    select: { passwordHash: true, isTempPassword: true },
  })) as { passwordHash: string | null; isTempPassword: boolean } | null;
  if (!user) return { error: "Пользователь не найден" };
  if (!user.passwordHash || user.isTempPassword) {
    return {
      error:
        "Пароль ещё не задан — установите его через «Забыли пароль?» на странице входа (восстановление по SMS)",
    };
  }

  const valid = await bcrypt.compare(current, user.passwordHash);
  if (!valid) return { error: "Текущий пароль неверен" };

  const passwordHash = await bcrypt.hash(next, 12);
  // Смена пароля отзывает все сессии: если пароль меняют из-за компрометации,
  // чужие устройства должны отвалиться немедленно, а не дожить до истечения JWT.
  await db.user.update({
    where: { id: session.id },
    data: { passwordHash, sessionsRevokedAt: new Date() },
  });
  await reissueCurrentSession(session.id, session.permissionRole);

  await recordAudit({
    actor: { id: session.id, name: session.name, permissionRole: session.permissionRole },
    action: "user.password_change",
    targetType: "User",
    targetId: session.id,
    targetLabel: session.name,
  });

  return { error: null, success: true };
}

/**
 * Свежий токен для устройства, выполнившего отзыв: его iat не младше порога
 * sessionsRevokedAt (посекундное сравнение в issuedBeforeRevocation), поэтому
 * инициатор остаётся в системе, а все ранее выпущенные токены умирают.
 */
async function reissueCurrentSession(userId: string, permissionRole: string): Promise<void> {
  const token = createToken({ userId, permissionRole });
  await setSessionCookie(token);
}

/** Выйти на всех устройствах, кроме текущего. */
export async function revokeOtherSessions(
  _prev: Result | null,
  _formData: FormData,
): Promise<Result> {
  const session = await requireAuth();

  await db.user.update({
    where: { id: session.id },
    data: { sessionsRevokedAt: new Date() },
  });
  await reissueCurrentSession(session.id, session.permissionRole);

  await recordAudit({
    actor: { id: session.id, name: session.name, permissionRole: session.permissionRole },
    action: "user.sessions_revoke",
    targetType: "User",
    targetId: session.id,
    targetLabel: session.name,
  });

  return { error: null, success: true };
}

/**
 * Удалить СВОЙ аккаунт (только клиенты).
 *
 * Soft-delete, как у админского удаления: deletedAt скрывает человека из CRM
 * и убивает сессии через getSession, но история заказов и сделок остаётся —
 * каскадный снос уже однажды уничтожал историю, больше никогда. Сотрудников
 * сюда не пускаем: их доступ — зона администратора, самоудаление сотрудника
 * оставило бы сервис без концов в аудите смен и задач.
 */
export async function deleteOwnAccount(
  _prev: Result | null,
  formData: FormData,
): Promise<Result> {
  const session = await requireAuth();
  if (session.permissionRole !== "CLIENT") {
    return { error: "Учётную запись сотрудника удаляет администратор" };
  }

  const password = ((formData.get("password") as string | null) ?? "").trim();
  if (!password) return { error: "Введите пароль для подтверждения" };

  const user = (await db.user.findUnique({
    where: { id: session.id },
    select: { passwordHash: true, isTempPassword: true },
  })) as { passwordHash: string | null; isTempPassword: boolean } | null;
  if (!user) return { error: "Пользователь не найден" };
  if (!user.passwordHash || user.isTempPassword) {
    return {
      error:
        "Удаление подтверждается паролем, а он ещё не задан. Установите его через «Забыли пароль?» на странице входа",
    };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { error: "Пароль неверен" };

  await db.user.update({
    where: { id: session.id },
    data: { deletedAt: new Date() },
  });
  await recordAudit({
    actor: { id: session.id, name: session.name, permissionRole: session.permissionRole },
    action: "user.self_delete",
    targetType: "User",
    targetId: session.id,
    targetLabel: session.name,
  });

  await clearSessionCookie();
  redirect("/");
}
