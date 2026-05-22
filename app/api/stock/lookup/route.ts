import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { lookupByCode, availableStock } from "@/lib/wms/public";
import { TENANT_KEY } from "@/lib/wms-host";

export const dynamic = "force-dynamic";

/**
 * GET /api/stock/lookup?code=<barcode|gtin|article>
 *
 * Foundation for barcode/NFC scanning. The WMS core resolves barcode/gtin
 * (host-agnostic); `article` is host catalog identity, so this route supplies
 * the article fallback. Admin/manager only.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }

  const code = (new URL(request.url).searchParams.get("code") ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "code is required" } }, { status: 400 });
  }

  // 1) Core: barcode / gtin.
  const view = await lookupByCode(db, code, TENANT_KEY);
  let itemId = view?.itemId ?? null;

  // 2) Host fallback: article (catalog identity, not known to the core).
  if (!itemId) {
    const byArticle = (await db.part.findFirst({
      where: { article: code, isActive: true },
      select: { id: true },
    })) as { id: string } | null;
    itemId = byArticle?.id ?? null;
  }

  if (!itemId) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Не найдено" } }, { status: 404 });
  }

  const part = (await db.part.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      article: true,
      stockItem: { select: { quantity: true, reserved: true, barcode: true } },
    },
  })) as {
    id: string;
    name: string;
    article: string;
    stockItem: { quantity: number; reserved: number; barcode: string | null } | null;
  } | null;
  if (!part) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Не найдено" } }, { status: 404 });
  }

  const si = part.stockItem;
  return NextResponse.json({
    data: {
      itemId: part.id,
      name: part.name,
      article: part.article,
      barcode: si?.barcode ?? null,
      quantity: si?.quantity ?? 0,
      available: si ? availableStock(si) : 0,
    },
  });
}
