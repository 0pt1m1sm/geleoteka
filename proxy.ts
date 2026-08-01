// Route-level auth scoping. Next.js 16 renamed the `middleware` file convention
// to `proxy` (root-level) — the previous app/middleware.ts was NEVER executed
// (wrong name AND wrong location), so until this migration every /admin and
// /cabinet request reached the page unprotected at the routing layer and only
// the per-page getSession()/requireRole() guards held the line. Those page
// guards remain the authoritative check; this proxy is the outer, fast-redirect
// layer. Runs in the Node.js runtime (default for proxy), so the shared
// jsonwebtoken-based verifyToken is safe to import.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import { permissionForPath } from "@/lib/permissions";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check session
  const token = request.cookies.get("session")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = verifyToken(token);

  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes are gated by the section permission the path demands, which an
  // admin edits on /admin/roles. This replaces a hardcoded "MANAGER/ADMIN see
  // everything, WAREHOUSE_WORKER sees the warehouse" — the same outcome now
  // comes from that role's default permissions, so nothing changed on the day
  // this shipped, but it can be changed without a deploy.
  //
  // An unmapped /admin path resolves to `dashboard.view`, so a route nobody
  // mapped stays closed to whoever could not open the panel before rather than
  // becoming a hole.
  if (pathname.startsWith("/admin")) {
    const role = payload.permissionRole;
    const needed = permissionForPath(pathname);
    if (needed !== null && !(await roleHasPermission(role, needed))) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

// Only protected sections — public pages never enter the proxy, so the old
// publicPaths allow-list is unnecessary here (the matcher IS the allow-list).
// /profile лежит вне обеих групп: профиль есть у всех вошедших, а не только у
// клиентов или только у сотрудников, — но защищать его всё равно надо.
export const config = {
  // The Telegram webhook and staff dispatcher deliberately stay outside this
  // session-auth matcher: each route fails closed on its own server secret.
  // /api/integrations/telegram/webhook and
  // /api/internal/staff-notifications/dispatch must never be added here.
  matcher: ["/cabinet/:path*", "/admin/:path*", "/profile"],
};
