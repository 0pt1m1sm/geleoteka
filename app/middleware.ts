import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

const publicPaths = ["/", "/services", "/models", "/about", "/contacts", "/blog", "/booking", "/login", "/register", "/reset-password", "/api/auth", "/api/slots", "/parts", "/rentals", "/vacancies"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

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
    const isWarehouseWorkerOnWarehouse =
      role === "WAREHOUSE_WORKER" && pathname.startsWith("/admin/warehouse");
    if (!isManagerOrAdmin && !isWarehouseWorkerOnWarehouse) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/cabinet/:path*", "/admin/:path*"],
};
