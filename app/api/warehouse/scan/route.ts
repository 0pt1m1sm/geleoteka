import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseScanCode } from "@/lib/wms/public";
import { TENANT_KEY } from "@/lib/wms-host";
import { resolveScan } from "@/lib/warehouse/scan-router";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["ADMIN", "MANAGER", "WAREHOUSE_WORKER"];

/**
 * POST /api/warehouse/scan — universal scan front door. Authenticates, parses
 * the raw QR, and delegates to resolveScan (the single ScanEvent writer) which
 * routes by object type and audits every scan including failures. The route
 * itself logs nothing; a request with no scannable code is a 400 and is NOT a
 * scan (no ScanEvent).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.permissionRole)) {
    return NextResponse.json(
      { error: { code: "PERMISSION_DENIED", message: "Unauthorized" } },
      { status: session ? 403 : 401 },
    );
  }

  let body: { rawCode?: unknown; action?: unknown; deviceId?: unknown; sessionId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON" } }, { status: 400 });
  }

  const rawCode = typeof body.rawCode === "string" ? body.rawCode.trim() : "";
  if (!rawCode) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "rawCode is required" } }, { status: 400 });
  }

  const outcome = await resolveScan(db, parseScanCode(rawCode), TENANT_KEY, {
    userId: session.id,
    action: typeof body.action === "string" && body.action ? body.action : "scan",
    deviceId: typeof body.deviceId === "string" ? body.deviceId : null,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
    articleResolver: async (code) => {
      const p = (await db.part.findFirst({
        where: { article: code, isActive: true },
        select: { id: true },
      })) as { id: string } | null;
      return p?.id ?? null;
    },
  });

  if (outcome.status === 200) {
    return NextResponse.json({ data: outcome.data });
  }
  return NextResponse.json(
    { error: { code: outcome.errorCode, message: outcome.message } },
    { status: outcome.status },
  );
}
