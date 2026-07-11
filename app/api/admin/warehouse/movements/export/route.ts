import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { TENANT_KEY } from "@/lib/wms-host";
import { resolveWarehouseId } from "@/app/actions/warehouses";
import { buildMovementsCsv, type MovementCsvRow } from "@/lib/warehouse/movement-csv";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EXPORT_CAP = 50000;
// NOT compile-enforced (as-const allow-list) — keep in sync with StockMovementReason.
const REASONS = ["RECEIPT", "RECEIPT_REVERSAL", "CONSUMPTION", "ADJUSTMENT", "RESERVATION", "RELEASE"] as const;

interface MovementRow {
  createdAt: Date;
  reason: string;
  quantityDelta: number;
  reservedDelta: number;
  sourceType: string;
  sourceId: string | null;
  note: string | null;
  actorUserId: string | null;
  item: { part: { name: string; article: string } | null } | null;
}

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sp = new URL(request.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const reason = sp.get("reason");
  const partId = sp.get("partId");
  const warehouseId = await resolveWarehouseId(sp.get("wh") ?? undefined);

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) createdAt.lte = new Date(`${to}T23:59:59.999Z`);

  const where = {
    tenantKey: TENANT_KEY,
    warehouseId,
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(reason && (REASONS as readonly string[]).includes(reason) ? { reason: reason as (typeof REASONS)[number] } : {}),
    ...(partId ? { item: { is: { partId } } } : {}),
  };

  const rows = (await db.stockMovement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_CAP,
    select: {
      createdAt: true,
      reason: true,
      quantityDelta: true,
      reservedDelta: true,
      sourceType: true,
      sourceId: true,
      note: true,
      actorUserId: true,
      item: { select: { part: { select: { name: true, article: true } } } },
    },
  })) as MovementRow[];

  // Batch-resolve actor names (no N+1): one query over the distinct actor ids.
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
  const actors =
    actorIds.length > 0
      ? ((await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })) as Array<{
          id: string;
          name: string;
        }>)
      : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  const csvRows: MovementCsvRow[] = rows.map((r) => ({
    createdAt: r.createdAt,
    partName: r.item?.part?.name ?? "",
    article: r.item?.part?.article ?? "",
    reason: r.reason,
    quantityDelta: r.quantityDelta,
    reservedDelta: r.reservedDelta,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    note: r.note,
    actor: r.actorUserId ? (actorName.get(r.actorUserId) ?? r.actorUserId) : "",
  }));

  const csv = buildMovementsCsv(csvRows);
  const datePart = formatDate(new Date(), { dateStyle: "short" }).replace(/\./g, "-");
  const headers: Record<string, string> = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="movements-${datePart}.csv"`,
    "Cache-Control": "no-store",
  };
  if (rows.length === EXPORT_CAP) headers["X-Truncated"] = "true";

  return new Response(csv, { status: 200, headers });
}
