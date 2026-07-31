"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";
import { sendSms } from "@/lib/sms";
import { isAllowedRole, type AllowedRole } from "@/lib/roles";

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



export interface PurgeBlocker {
  label: string;
  count: number;
}

/**
 * Why a person cannot be purged — the business records that would be lost.
 *
 * Counting is for the OPERATOR's benefit (a clear "3 заказ-наряда, 1 сделка"
 * beats a constraint error). It is NOT the safety mechanism: the root business
 * FKs are ON DELETE RESTRICT, so if this list ever misses a relation the
 * database refuses the delete instead of destroying history. Two layers, and
 * the database is the one that decides.
 */
export async function getPurgeBlockers(
  userId: string,
): Promise<Ok<{ blockers: PurgeBlocker[] }> | Fail> {
  await requireRole(["ADMIN"]);

  const [repairOrders, deals, communications, tasks, rentals, loyalty, servicedCars] =
    (await Promise.all([
      db.repairOrder.count({ where: { userId } }),
      db.deal.count({ where: { customerUserId: userId } }),
      db.communicationLog.count({ where: { customerUserId: userId } }),
      db.crmTask.count({ where: { ownerUserId: userId } }),
      db.rentalBooking.count({ where: { userId } }),
      // Loyalty hangs off LoyaltyAccount, not the user directly.
      db.loyaltyTransaction.count({ where: { account: { userId } } }),
      // A car is part of the person's profile, not history, so simply owning
      // one does not block a purge — it is deleted with them. A car that has
      // been through the shop IS history, and `RepairOrder.vehicleId` cascades,
      // so deleting it would take those orders (possibly another customer's,
      // if the car changed hands) with it. That case blocks.
      db.vehicle.count({
        where: {
          ownerUserId: userId,
          OR: [{ repairOrders: { some: {} } }, { rentalBookings: { some: {} } }],
        },
      }),
    ])) as number[];

  const blockers: PurgeBlocker[] = [
    { label: "заказ-наряды", count: repairOrders },
    { label: "сделки", count: deals },
    { label: "переписка", count: communications },
    { label: "задачи", count: tasks },
    { label: "аренды", count: rentals },
    { label: "бонусные операции", count: loyalty },
    { label: "автомобили с историей обслуживания", count: servicedCars },
  ].filter((b) => b.count > 0);

  return { ok: true, blockers };
}

/**
 * Permanently remove a person who has NO business history.
 *
 * This is the cleanup path for genuine rubbish — a mistyped duplicate, an
 * abandoned self-registration, a test row — which archiving alone would leave
 * piling up in the admin lists forever. It deliberately refuses the moment the
 * person has anything attached: a real customer is archived, never purged.
 *
 * Deliberately NOT a "delete with all history" button. That existed here
 * briefly and was removed: showing an operator what is about to be destroyed
 * and then destroying it is a warning, not a safeguard.
 */
export async function purgeEmptyUser(userId: string): Promise<Ok | Fail> {
  const session = await requireRole(["ADMIN"]);

  const target = (await db.user.findUnique({
    where: { id: userId },
    select: { id: true, permissionRole: true, isSupplier: true },
  })) as { id: string; permissionRole: string; isSupplier: boolean } | null;
  if (!target) return { ok: false, error: "Пользователь не найден" };

  if (target.id === session.id) {
    return { ok: false, error: "Нельзя удалить собственный аккаунт" };
  }
  if (target.permissionRole === "ADMIN") {
    const admins = await db.user.count({
      where: { permissionRole: "ADMIN", deletedAt: null },
    });
    if (admins <= 1) return { ok: false, error: "Нельзя удалить последнего администратора" };
  }

  const blockersResult = await getPurgeBlockers(userId);
  if (!blockersResult.ok) return blockersResult;
  if (blockersResult.blockers.length > 0) {
    const detail = blockersResult.blockers.map((b) => `${b.label}: ${b.count}`).join(", ");
    return {
      ok: false,
      error: `Здесь удаляются только пустые записи, а у пользователя есть данные (${detail}). Используйте полное удаление с выгрузкой копии.`,
    };
  }

  try {
    await db.user.delete({ where: { id: userId } });
  } catch (err) {
    // The RESTRICT constraints caught a relation the checks above do not know
    // about. That is the safety net doing its job, not a bug to route around.
    const code = err && typeof err === "object" ? (err as { code?: string }).code : undefined;
    if (code === "P2003" || (err instanceof Error && err.message.includes("Foreign key"))) {
      return {
        ok: false,
        error: "Нельзя удалить — у пользователя остались связанные записи в системе.",
      };
    }
    throw err;
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/customers");
  return { ok: true };
}

/**
 * Reset a user's password to a fresh 10-char temp string, returned to the admin
 * and sent by SMS. ADMIN/MANAGER only.
 *
 * `isTempPassword` is deliberately set to FALSE. It does not mean "this
 * password is temporary" — per the schema it means "the hash was generated by
 * the guest booking/cart flow and the user does not know it", and `login.ts`
 * refuses any login while it is set. Marking a freshly issued password with it
 * meant the manager handed the customer a password that could not be used and
 * got "Пароль не задан" instead. The password produced here IS known to the
 * user, so the flag does not apply.
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
    data: { passwordHash, isTempPassword: false },
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
