import "server-only";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import type { OAuthProfile, OAuthProvider } from "@/lib/oauth";
import { isValidRussianPhone, normalizePhone } from "@/lib/utils";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

/** Кука с подписанным профилем провайдера на время дозаполнения регистрации. */
export const OAUTH_PENDING_COOKIE = "oauth_pending";
export const OAUTH_PENDING_MAX_AGE = 15 * 60; // секунд

interface MatchedUser {
  id: string;
  permissionRole: string;
  deletedAt: Date | null;
}

export type OAuthLoginResult =
  | { kind: "login"; userId: string; permissionRole: string }
  | { kind: "pending" }
  | { kind: "rejected"; reason: string };

const USER_SELECT = { id: true, permissionRole: true, deletedAt: true } as const;

function guard(user: MatchedUser): OAuthLoginResult {
  if (user.deletedAt) return { kind: "rejected", reason: "Учётная запись недоступна" };
  if (user.permissionRole === "NONE") {
    return { kind: "rejected", reason: "Учётная запись не может выполнить вход" };
  }
  return { kind: "login", userId: user.id, permissionRole: user.permissionRole };
}

/**
 * Матчинг профиля провайдера с локальным аккаунтом:
 * привязка → email → телефон → автосоздание (если провайдер отдал и email,
 * и валидный российский телефон) → дозаполнение ("pending").
 * Email/телефон от провайдера считаем подтверждёнными — и Яндекс, и VK
 * верифицируют их на своей стороне.
 */
export async function resolveOAuthLogin(
  provider: OAuthProvider,
  profile: OAuthProfile,
): Promise<OAuthLoginResult> {
  // 1. Уже привязан.
  const linked = (await db.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
    select: { user: { select: USER_SELECT } },
  })) as { user: MatchedUser } | null;
  if (linked) return guard(linked.user);

  // 2-3. Существующий пользователь по email или телефону → привязать и войти.
  let existing: MatchedUser | null = null;
  if (profile.email) {
    existing = (await db.user.findUnique({
      where: { email: profile.email },
      select: USER_SELECT,
    })) as MatchedUser | null;
  }
  const phone = profile.phone ? normalizePhone(profile.phone) : "";
  if (!existing && isValidRussianPhone(phone)) {
    existing = (await db.user.findUnique({
      where: { phone },
      select: USER_SELECT,
    })) as MatchedUser | null;
  }
  if (existing) {
    const verdict = guard(existing);
    if (verdict.kind === "login") {
      await db.oAuthAccount.create({
        data: { provider, providerUserId: profile.providerUserId, userId: existing.id },
      });
    }
    return verdict;
  }

  // 4. Полный профиль → создаём аккаунт сразу.
  if (profile.email && isValidRussianPhone(phone)) {
    const user = (await db.user.create({
      data: {
        email: profile.email,
        phone,
        name: profile.name,
        passwordHash: null, // вход по паролю появится после «восстановления» по SMS
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
    return { kind: "login", userId: user.id, permissionRole: user.permissionRole };
  }

  // 5. Данных не хватает — дозаполнение на /register/complete.
  return { kind: "pending" };
}

interface PendingPayload {
  t: "oauth_pending";
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  phone: string | null;
  name: string;
}

export function signPendingProfile(provider: OAuthProvider, profile: OAuthProfile): string {
  const payload: PendingPayload = {
    t: "oauth_pending",
    provider,
    providerUserId: profile.providerUserId,
    email: profile.email,
    phone: profile.phone,
    name: profile.name,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}

export function verifyPendingProfile(
  token: string,
): { provider: OAuthProvider; profile: OAuthProfile } | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as PendingPayload;
    if (p.t !== "oauth_pending") return null;
    return {
      provider: p.provider,
      profile: {
        providerUserId: p.providerUserId,
        email: p.email,
        phone: p.phone,
        name: p.name,
      },
    };
  } catch {
    return null;
  }
}
