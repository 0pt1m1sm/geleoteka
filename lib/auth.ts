import jwt, { type SignOptions } from "jsonwebtoken";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";

/**
 * Session signing key. Refuses to start without one in production.
 *
 * This used to fall back to a literal in this file. Since the repository is
 * public, an empty or missing `JWT_SECRET` would have silently signed sessions
 * with a string anyone can read — enough to forge an admin session. A missing
 * secret is a deployment fault, and the app must not come up pretending
 * otherwise. Development keeps a fixed key so local work needs no setup.
 */
const JWT_SECRET = (() => {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is not set. Refusing to start: sessions would be signed with a publicly known key.",
    );
  }
  return "dev-only-secret-never-used-in-production";
})();
const JWT_EXPIRES_IN: SignOptions["expiresIn"] = (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"];

interface JWTPayload {
  userId: string;
  permissionRole: string;
}

interface SessionUser {
  id: string;
  email: string;
  phone: string;
  name: string;
  permissionRole: string;
}

/** Create a JWT token for a user */
export function createToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/** Verify and decode a JWT token */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

/** Set session cookie */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

/** Clear session cookie */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

/** Get current session user from cookie */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, phone: true, name: true, permissionRole: true, deletedAt: true },
  });

  if (!user) return null;
  // Soft-deleted users must not keep a live session — an admin "deleting" a
  // customer sets deletedAt, and that has to revoke access on the next request.
  if (user.deletedAt) return null;
  // NONE permission role = entity exists in DB but cannot log in (e.g. suppliers).
  // If a NONE token somehow exists, reject it.
  if (user.permissionRole === "NONE") return null;

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    permissionRole: user.permissionRole,
  };
});

/** Require authentication — redirects to /login if not authenticated */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/** Require specific role — redirects to /login if unauthorized */
export async function requireRole(roles: string[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!roles.includes(session.permissionRole)) {
    redirect("/");
  }
  return session;
}
