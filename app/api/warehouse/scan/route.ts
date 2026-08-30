import { NextResponse } from "next/server";
import {
  prismaPartCodePort,
  resolvePartIdByCode,
  scanSourceFor,
} from "@/lib/parts/resolve-part-code";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseScanCode } from "@/lib/wms/public";
import { TENANT_KEY } from "@/lib/wms-host";
import { resolveWarehouseId } from "@/app/actions/warehouses";
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

  let body: { rawCode?: unknown; action?: unknown; deviceId?: unknown; sessionId?: unknown; warehouseId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON" } }, { status: 400 });
  }

  const rawCode = typeof body.rawCode === "string" ? body.rawCode.trim() : "";
  if (!rawCode) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "rawCode is required" } }, { status: 400 });
  }

  const warehouseId = await resolveWarehouseId(
    typeof body.warehouseId === "string" ? body.warehouseId : undefined,
  );
  const parsedCode = parseScanCode(rawCode);
  const outcome = await resolveScan(db, parsedCode, TENANT_KEY, {
    userId: session.id,
    action: typeof body.action === "string" && body.action ? body.action : "scan",
    deviceId: typeof body.deviceId === "string" ? body.deviceId : null,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
    warehouseId,
    articleResolver: async (code) => {
      // Источник берём из типа исходного кода: resolveScan зовёт этот
      // резолвер и для PART (наша этикетка), и для RAW (человек ввёл номер,
      // прочитанный с самой детали). Захардкоженный "label" означал бы, что
      // введённый вручную номер молча попадает в НОВУЮ строку — то самое
      // движение остатка по чужой позиции, ради которого модуль и написан.
      // No isActive filter: a part deactivated in the shop still physically
      // exists in the warehouse and must be scannable (putaway/move/count).
      const r = await resolvePartIdByCode(
        prismaPartCodePort(db),
        code,
        scanSourceFor(parsedCode.type),
      );
      return r.status === "found" ? r.partId : null;
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
