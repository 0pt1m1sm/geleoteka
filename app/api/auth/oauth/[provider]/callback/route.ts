import { NextResponse } from "next/server";
import { createToken } from "@/lib/auth";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  fetchOAuthProfile,
  isOAuthProvider,
} from "@/lib/oauth";
import {
  OAUTH_PENDING_COOKIE,
  OAUTH_PENDING_MAX_AGE,
  resolveOAuthLogin,
  signPendingProfile,
} from "@/lib/oauth-login";

interface RouteCtx {
  params: Promise<{ provider: string }>;
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function landingFor(permissionRole: string): string {
  if (permissionRole === "ADMIN" || permissionRole === "MANAGER") return "/admin";
  if (permissionRole === "WAREHOUSE_WORKER") return "/admin/warehouse";
  return "/cabinet";
}

/** Callback провайдера: state-проверка → профиль → матчинг → сессия. */
export async function GET(request: Request, ctx: RouteCtx): Promise<Response> {
  const { provider } = await ctx.params;
  const url = new URL(request.url);
  const origin = url.origin;
  const fail = (code: string): Response =>
    NextResponse.redirect(`${origin}/login?oauth_error=${code}`);

  if (!isOAuthProvider(provider)) return fail("unknown_provider");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(request, OAUTH_STATE_COOKIE);
  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("state_mismatch");
  }

  let result;
  try {
    const profile = await fetchOAuthProfile(provider, {
      code,
      state,
      deviceId: url.searchParams.get("device_id"),
      verifier: readCookie(request, OAUTH_VERIFIER_COOKIE),
    });
    result = { profile, verdict: await resolveOAuthLogin(provider, profile) };
  } catch (err) {
    console.error(`[OAUTH ${provider}]`, err);
    return fail("exchange_failed");
  }

  const cleanup = (res: NextResponse): NextResponse => {
    res.cookies.delete(OAUTH_STATE_COOKIE);
    res.cookies.delete(OAUTH_VERIFIER_COOKIE);
    return res;
  };

  const { verdict, profile } = result;

  if (verdict.kind === "rejected") return cleanup(NextResponse.redirect(`${origin}/login?oauth_error=account_blocked`));

  if (verdict.kind === "pending") {
    const res = NextResponse.redirect(`${origin}/register/complete`);
    res.cookies.set(OAUTH_PENDING_COOKIE, signPendingProfile(provider, profile), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: OAUTH_PENDING_MAX_AGE,
      path: "/",
    });
    return cleanup(res);
  }

  // Успешный вход — кука сессии в том же формате, что setSessionCookie (lib/auth).
  const res = cleanup(NextResponse.redirect(`${origin}${landingFor(verdict.permissionRole)}`));
  res.cookies.set("session", createToken({ userId: verdict.userId, permissionRole: verdict.permissionRole }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
