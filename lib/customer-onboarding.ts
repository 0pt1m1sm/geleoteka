import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/utils";

export type GuestCustomerResult =
  | {
      ok: true;
      userId: string;
      isReturning: boolean;
      hasRealPassword: boolean;
      matchedBy: "session" | "email" | "phone" | "created";
    }
  | { ok: false; error: string };

export const PHONE_COLLISION_ERROR =
  "Этот телефон уже зарегистрирован на другой email. Войдите в существующий аккаунт или используйте другой телефон.";

// Intentional rounds=10 (vs rounds=12 used for real passwords in register.ts /
// setPasswordForGuestUser). The hash exists only to satisfy the NOT-NULL
// passwordHash invariant for guest users — the random seed is thrown away
// immediately, so no user will ever attempt to bcrypt.compare against this.
// rounds=10 keeps booking/cart submission ~50ms faster without weakening
// anything user-facing.
export async function generateTempPasswordHash(): Promise<string> {
  const random = crypto.randomBytes(24).toString("hex");
  return bcrypt.hash(random, 10);
}

export function generateClaimToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function isValidPassword(p: string): { ok: true } | { ok: false; error: string } {
  if (!p || p.length < 6) return { ok: false, error: "Пароль должен быть минимум 6 символов" };
  return { ok: true };
}

export async function findOrCreateGuestCustomer(input: {
  sessionUserId: string | null;
  name: string;
  email: string;
  phone: string;
}): Promise<GuestCustomerResult> {
  const phone = normalizePhone(input.phone);
  const email = input.email.trim().toLowerCase();

  if (input.sessionUserId) {
    const u = (await db.user.findUnique({
      where: { id: input.sessionUserId },
      select: { id: true, isTempPassword: true },
    })) as { id: string; isTempPassword: boolean } | null;
    if (u) {
      return {
        ok: true,
        userId: u.id,
        isReturning: true,
        hasRealPassword: !u.isTempPassword,
        matchedBy: "session",
      };
    }
  }

  const byEmail = (await db.user.findUnique({
    where: { email },
    select: { id: true, isTempPassword: true },
  })) as { id: string; isTempPassword: boolean } | null;
  if (byEmail) {
    return {
      ok: true,
      userId: byEmail.id,
      isReturning: true,
      hasRealPassword: !byEmail.isTempPassword,
      matchedBy: "email",
    };
  }

  const byPhone = (await db.user.findUnique({
    where: { phone },
    select: { id: true, email: true, isTempPassword: true },
  })) as { id: string; email: string; isTempPassword: boolean } | null;
  if (byPhone) {
    if (byPhone.email !== email) {
      return { ok: false, error: PHONE_COLLISION_ERROR };
    }
    return {
      ok: true,
      userId: byPhone.id,
      isReturning: true,
      hasRealPassword: !byPhone.isTempPassword,
      matchedBy: "phone",
    };
  }

  try {
    const tempHash = await generateTempPasswordHash();
    const created = (await db.user.create({
      data: {
        email,
        phone,
        name: input.name,
        passwordHash: tempHash,
        isTempPassword: true,
        permissionRole: "CLIENT",
        isCustomer: true,
      },
    })) as { id: string };
    await db.loyaltyAccount.create({ data: { userId: created.id } });
    return {
      ok: true,
      userId: created.id,
      isReturning: false,
      hasRealPassword: false,
      matchedBy: "created",
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      const refetch = (await db.user.findUnique({
        where: { email },
        select: { id: true, isTempPassword: true },
      })) as { id: string; isTempPassword: boolean } | null;
      if (refetch) {
        return {
          ok: true,
          userId: refetch.id,
          isReturning: true,
          hasRealPassword: !refetch.isTempPassword,
          matchedBy: "email",
        };
      }
    }
    throw err;
  }
}
