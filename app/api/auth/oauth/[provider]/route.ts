import { NextResponse } from "next/server";
import {
  OAUTH_COOKIE_MAX_AGE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  buildAuthorizeUrl,
  isOAuthProvider,
} from "@/lib/oauth";

interface RouteCtx {
  params: Promise<{ provider: string }>;
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: OAUTH_COOKIE_MAX_AGE,
  path: "/",
} as const;

/** Старт входа через провайдера: state/PKCE в куки → редирект на провайдера. */
export async function GET(request: Request, ctx: RouteCtx): Promise<Response> {
  const { provider } = await ctx.params;
  const origin = new URL(request.url).origin;

  if (!isOAuthProvider(provider)) {
    return NextResponse.redirect(`${origin}/login?oauth_error=unknown_provider`);
  }

  const start = await buildAuthorizeUrl(provider);
  if (!start) {
    return NextResponse.redirect(`${origin}/login?oauth_error=not_configured`);
  }

  const res = NextResponse.redirect(start.authorizeUrl);
  res.cookies.set(OAUTH_STATE_COOKIE, start.state, COOKIE_OPTS);
  if (start.verifier) {
    res.cookies.set(OAUTH_VERIFIER_COOKIE, start.verifier, COOKIE_OPTS);
  }
  return res;
}
