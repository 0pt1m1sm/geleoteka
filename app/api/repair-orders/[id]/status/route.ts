import { NextResponse } from "next/server";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const { id } = await context.params;

  const repairOrder = await db.repairOrder.findUnique({
    where: { id },
    select: { status: true, updatedAt: true },
  });

  if (!repairOrder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: repairOrder.status,
    updatedAt: repairOrder.updatedAt,
  });
}
