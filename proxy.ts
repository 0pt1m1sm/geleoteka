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

export function proxy(request: NextRequest) {
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

  // Admin routes — MANAGER/ADMIN have full access; WAREHOUSE_WORKER is scoped
  // to the warehouse section only (its login lands on /admin/warehouse and the
  // warehouse pages already requireRole it; finer per-page gating stays there).
  if (pathname.startsWith("/admin")) {
    const role = payload.permissionRole;
    const isManagerOrAdmin = role === "MANAGER" || role === "ADMIN";
    // Segment-boundary match — a plain startsWith would also admit a future
    // sibling route like /admin/warehouse-reports (security-review hardening).
    const isWarehouseWorkerOnWarehouse =
      role === "WAREHOUSE_WORKER" &&
      (pathname === "/admin/warehouse" || pathname.startsWith("/admin/warehouse/"));
    if (!isManagerOrAdmin && !isWarehouseWorkerOnWarehouse) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

// Only protected sections — public pages never enter the proxy, so the old
// publicPaths allow-list is unnecessary here (the matcher IS the allow-list).
export const config = {
  matcher: ["/cabinet/:path*", "/admin/:path*"],
};
