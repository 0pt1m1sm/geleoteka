import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
    select: { userId: true, status: true, updatedAt: true },
  });

  if (!repairOrder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Authorisation: staff see any order, a client sees only their own.
  // Without this, any repair-order status was readable by guessing its id.
  const session = await getSession();
  const isStaff =
    session?.permissionRole === "ADMIN" || session?.permissionRole === "MANAGER";
  const isOwner = session?.id === repairOrder.userId;
  if (!isStaff && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    status: repairOrder.status,
    updatedAt: repairOrder.updatedAt,
  });
}
