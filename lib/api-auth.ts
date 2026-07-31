/**
 * The API-route shape of an authorization check.
 *
 * Route handlers were each converting the page-shaped helper into an HTTP
 * answer by hand:
 *
 *     try { await requireRole(["ADMIN", "MANAGER"]); }
 *     catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
 *
 * — catching a redirect meant for a browser and reshaping it per route, with
 * the status code chosen anew each time (401 for a signed-in user who simply
 * lacks the right is wrong; that is 403).
 *
 * The decision itself lives in `lib/authz.ts` and is shared with pages, actions
 * and the proxy. This module only chooses how to say "no" over HTTP, which is
 * the one thing that genuinely differs here.
 */
import { NextResponse } from "next/server";

import { getSession, type SessionUser } from "@/lib/auth";
import { roleHasPermission } from "@/lib/authz";
import type { Permission } from "@/lib/permissions";

export type ApiAuth =
  | { ok: true; session: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Usage:
 *
 *     const auth = await requireApiPermission("crm.manage");
 *     if (!auth.ok) return auth.response;
 *     // auth.session is typed and present from here on
 *
 * Returning the response rather than throwing keeps the handler's control flow
 * visible: there is no invisible redirect to catch, and the compiler makes the
 * early return impossible to forget once the session is used.
 */
export async function requireApiPermission(permission: Permission): Promise<ApiAuth> {
  const session = await getSession();
  if (!session) {
    // Not signed in at all — the client may retry after logging in.
    return {
      ok: false,
      response: NextResponse.json({ error: "Требуется вход" }, { status: 401 }),
    };
  }
  if (!(await roleHasPermission(session.permissionRole, permission))) {
    // Signed in, but not allowed. Retrying will not help, and saying 401 here
    // invites clients to bounce the user through a pointless login.
    return {
      ok: false,
      response: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
