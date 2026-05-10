"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";
import { sendSms } from "@/lib/sms";

const NAME_MAX = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("Unique constraint")) return true;
  if ("code" in err && (err as { code?: string }).code === "P2002") return true;
  return false;
}

function generateTempPassword(): string {
  const out: string[] = [];
  for (let i = 0; i < 10; i++) {
    out.push(PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)]);
  }
  return out.join("");
}

type Ok<T extends object = object> = { ok: true } & T;
type Fail = { ok: false; error: string };

const ALLOWED_ROLES = ["NONE", "CLIENT", "MASTER", "MANAGER", "ADMIN"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

function isAllowedRole(v: unknown): v is AllowedRole {
  return typeof v === "string" && (ALLOWED_ROLES as readonly string[]).includes(v);
}

/**
 * Reset a user's password to a fresh 10-char temp string. Marks
 * isTempPassword=true so the next login can prompt re-setting it
 * (and so the post-checkout claim panel still works for guest-style
 * accounts). Returns the temp password to the admin to communicate
 * to the user out-of-band, AND fires an SMS so the user gets it
 * immediately. ADMIN/MANAGER only.
 */
export async function resetUserPassword(
  userId: string,
): Promise<Ok<{ tempPassword: string }> | Fail> {
  await requireRole(["ADMIN", "MANAGER"]);

  const user = (await db.user.findUnique({
    where: { id: userId },
    select: { phone: true, name: true, permissionRole: true },
  })) as { phone: string; name: string; permissionRole: string } | null;
  if (!user) return { ok: false, error: "Пользователь не найден" };
  if (user.permissionRole === "NONE") {
    return {
      ok: false,
      error: "Эта учётная запись не может выполнять вход (роль NONE)",
    };
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await db.user.update({
    where: { id: userId },
    data: { passwordHash, isTempPassword: true },
  });

  // Fire-and-log SMS — failure shouldn't block the admin getting the
  // temp password back, since they need to communicate it themselves
  // if SMS provider is down.
  void sendSms(
    user.phone,
    `Geleoteka: Ваш временный пароль ${tempPassword}. Войдите и смените его в личном кабинете.`,
  ).catch((err) => console.error("[reset-password sms]", err));

  revalidatePath(`/admin/customers/${userId}`);
  revalidatePath(`/admin/team/${userId}`);
  return { ok: true, tempPassword };
}

/**
 * Edit user contact triple (name/email/phone). Used for any user role.
 * Validates phone (RU format) and email (basic regex). Returns ok or
 * collision error. ADMIN/MANAGER only.
 */
export async function updateUserContacts(
  userId: string,
  input: { name: string; email: string; phone: string },
): Promise<Ok | Fail> {
  await requireRole(["ADMIN", "MANAGER"]);

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone.trim());

  if (!name || name.length > NAME_MAX) {
    return { ok: false, error: "Имя обязательно (до 120 символов)" };
  }
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Некорректный email" };
  }
  if (!isValidRussianPhone(phone)) {
    return {
      ok: false,
      error: "Телефон должен быть в формате +7XXXXXXXXXX или 8XXXXXXXXXX",
    };
  }

  try {
    await db.user.update({
      where: { id: userId },
      data: { name, email, phone },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        error: "Email или телефон уже используются другим пользователем",
      };
    }
    throw err;
  }

  revalidatePath(`/admin/customers/${userId}`);
  revalidatePath(`/admin/team/${userId}`);
  return { ok: true };
}

/**
 * Change a user's permissionRole. ADMIN-only — managers must not be
 * able to elevate themselves or others. Refuses to demote the last
 * remaining ADMIN to prevent locking the org out.
 */
export async function changeUserRole(
  userId: string,
  newRole: string,
): Promise<Ok | Fail> {
  const session = await requireRole(["ADMIN"]);

  if (!isAllowedRole(newRole)) {
    return { ok: false, error: "Неизвестная роль" };
  }

  const user = (await db.user.findUnique({
    where: { id: userId },
    select: { permissionRole: true },
  })) as { permissionRole: string } | null;
  if (!user) return { ok: false, error: "Пользователь не найден" };

  // Last-admin guard: refuse to demote the only ADMIN to anything else.
  if (user.permissionRole === "ADMIN" && newRole !== "ADMIN") {
    const adminCount = await db.user.count({ where: { permissionRole: "ADMIN" } });
    if (adminCount <= 1) {
      return {
        ok: false,
        error: "Нельзя понизить последнего администратора — назначьте сначала другого",
      };
    }
  }

  // Self-demotion guard: prevent admin from accidentally demoting themselves.
  if (session.id === userId && newRole !== "ADMIN") {
    return {
      ok: false,
      error: "Нельзя изменить свою роль — попросите другого администратора",
    };
  }

  await db.user.update({
    where: { id: userId },
    data: { permissionRole: newRole as AllowedRole },
  });

  revalidatePath(`/admin/customers/${userId}`);
  revalidatePath(`/admin/team/${userId}`);
  return { ok: true };
}

/**
 * Disable login for a user by setting permissionRole=NONE and clearing
 * the password hash. Reversible only by changeUserRole back to a real
 * role + resetUserPassword. ADMIN-only with the same self-protection
 * and last-admin guards as changeUserRole.
 */
export async function setUserDisabled(
  userId: string,
  disabled: boolean,
): Promise<Ok | Fail> {
  const session = await requireRole(["ADMIN"]);

  if (session.id === userId && disabled) {
    return { ok: false, error: "Нельзя заблокировать свой аккаунт" };
  }

  if (disabled) {
    const user = (await db.user.findUnique({
      where: { id: userId },
      select: { permissionRole: true },
    })) as { permissionRole: string } | null;
    if (!user) return { ok: false, error: "Пользователь не найден" };
    if (user.permissionRole === "ADMIN") {
      const adminCount = await db.user.count({
        where: { permissionRole: "ADMIN" },
      });
      if (adminCount <= 1) {
        return {
          ok: false,
          error: "Нельзя заблокировать последнего администратора",
        };
      }
    }
    await db.user.update({
      where: { id: userId },
      data: { permissionRole: "NONE", passwordHash: null, isTempPassword: false },
    });
  } else {
    // Restoring access — give CLIENT role by default. Admin can elevate
    // afterwards via changeUserRole. Caller should follow up with
    // resetUserPassword to give the user a working credential.
    await db.user.update({
      where: { id: userId },
      data: { permissionRole: "CLIENT" },
    });
  }

  revalidatePath(`/admin/customers/${userId}`);
  revalidatePath(`/admin/team/${userId}`);
  return { ok: true };
}
