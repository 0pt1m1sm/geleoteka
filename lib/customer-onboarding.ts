import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { tenantDb } from "@/lib/tenant/scoped-db";
import { normalizePhone } from "@/lib/utils";

export type GuestCustomerErrorKind = "phone_collision" | "other";

export type GuestCustomerResult =
  | {
      ok: true;
      userId: string;
      isReturning: boolean;
      hasRealPassword: boolean;
      matchedBy: "session" | "email" | "phone" | "created";
    }
  | { ok: false; kind: GuestCustomerErrorKind; error: string };

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

/**
 * Срок жизни ссылки на присвоение заказа — 14 дней с момента оформления.
 *
 * Токен выдаётся ТОЛЬКО при создании заказа гостем и уходит человеку в SMS.
 * Отдельной колонки под срок нет и не нужно: возраст токена равен возрасту
 * заказа. Две недели — с запасом на «оформил, вернулся через отпуск»; всё, что
 * дольше, это уже не «забрать свой заказ», а живая ссылка в чужой переписке.
 *
 * Истёкший токен НЕ запирает человека: у него есть временный пароль из той же
 * SMS, а если и он потерян — восстановление по телефону. Поэтому цена ошибки
 * в сторону строгости здесь низкая, а в сторону вечного токена — высокая.
 *
 * Осознанно НЕ распространяется на согласование сметы гостем
 * (`app/actions/customer-estimates.ts`, токен на `Deal`): ремонт законно ждёт
 * запчастей неделями, и просроченная там ссылка ломала бы рабочий сценарий.
 */
export const CLAIM_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** true, если ссылка на присвоение заказа уже просрочена. */
export function claimTokenExpired(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() > CLAIM_TOKEN_TTL_MS;
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
  /** Marketing source applied only when a brand-new User row is created.
      Returning customers (matched by session/email/phone) keep their
      existing referralSource — never overwrite a real attribution. */
  referralSource?:
    | "YANDEX"
    | "GOOGLE"
    | "AVITO"
    | "INSTAGRAM"
    | "TELEGRAM_CHAN"
    | "FRIEND"
    | "REPEAT"
    | "WALK_IN"
    | "EMAIL"
    | "OTHER";
}): Promise<GuestCustomerResult> {
  const db = await tenantDb();
  const phone = normalizePhone(input.phone);
  const email = input.email.trim().toLowerCase();
  const referralSource = input.referralSource ?? "WALK_IN";

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
      return { ok: false, kind: "phone_collision", error: PHONE_COLLISION_ERROR };
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
        referralSource,
        customerProfile: { create: {} },
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
