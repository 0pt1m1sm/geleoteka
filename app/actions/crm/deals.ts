"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recomputeDealTotals } from "@/lib/crm/internal/recompute-deal-totals";
import { createDeal as createDealPublic } from "@/lib/crm/public/create-deal";

interface DealMutationResult {
  error: string | null;
  success?: boolean;
  dealId?: string;
}

/**
 * DealLine.total is signed: DISCOUNT lines reduce the deal, every
 * other type adds. Managers enter discount amounts as positive
 * numbers (1 × 500 ₽ feels natural); the server normalises the
 * stored total + unitPrice so accumulation in recomputeDealTotals
 * is a straight SUM and the print view shows a real "minus" sign.
 */
function signedLineTotal(type: string, qty: number, unitPrice: number): {
  total: number;
  unitPrice: number;
} {
  const rawAbsPrice = Math.abs(unitPrice);
  const signedPrice = type === "DISCOUNT" ? -rawAbsPrice : rawAbsPrice;
  return {
    unitPrice: signedPrice,
    total: Math.round(qty * signedPrice),
  };
}

/**
 * Manager-initiated deal creation (walk-in or phone). Picks a customer
 * + optional vehicle + channel and lands the user on the empty deal
 * detail page to add lines.
 */
export async function createDealManually(
  _prev: DealMutationResult | null,
  formData: FormData,
): Promise<DealMutationResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const customerUserId = ((formData.get("customerUserId") as string | null) ?? "").trim();
  if (!customerUserId) return { error: "Выберите клиента" };
  const channel = ((formData.get("channel") as string | null) ?? "WALK_IN").trim();
  const source = ((formData.get("source") as string | null) ?? "manual").trim() || "manual";
  const vehicleIdRaw = ((formData.get("vehicleId") as string | null) ?? "").trim();
  const vehicleId = vehicleIdRaw || null;
  const notes = ((formData.get("notes") as string | null) ?? "").trim() || null;

  const customer = (await db.user.findUnique({
    where: { id: customerUserId },
    select: { id: true },
  })) as { id: string } | null;
  if (!customer) return { error: "Клиент не найден" };

  if (vehicleId) {
    const veh = (await db.vehicle.findUnique({
      where: { id: vehicleId },
      select: { ownerUserId: true },
    })) as { ownerUserId: string | null } | null;
    if (!veh) return { error: "Автомобиль не найден" };
  }

  const deal = await createDealPublic({
    customerUserId: customer.id,
    vehicleId,
    ownerUserId: session.id,
    channel: channel as never,
    source,
    initialStage: "DRAFT",
    notes,
  });

  revalidatePath("/admin/crm/deals");
  redirect(`/admin/crm/deals/${deal.id}`);
}

export async function addDealLine(
  _prevState: DealMutationResult | null,
  formData: FormData,
): Promise<DealMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const dealId = formData.get("dealId") as string;
  if (!dealId) return { error: "Не передан dealId" };

  const description = ((formData.get("description") as string | null) ?? "").trim();
  if (!description) return { error: "Введите описание" };

  const type = ((formData.get("type") as string | null) ?? "LABOR").trim();
  const qty = Number.parseFloat((formData.get("qty") as string) ?? "1") || 1;
  const rawUnitPrice = Number.parseInt((formData.get("unitPrice") as string) ?? "0", 10) || 0;
  const partId = ((formData.get("partId") as string | null) ?? "").trim() || null;

  const { unitPrice, total } = signedLineTotal(type, qty, rawUnitPrice);

  const last = await db.dealLine.findFirst({
    where: { dealId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = last ? (last as { sortOrder: number }).sortOrder + 1 : 0;

  await db.dealLine.create({
    data: {
      dealId,
      sortOrder,
      type: type as never,
      description,
      qty,
      unitPrice,
      total,
      partId,
    },
  });

  await recomputeDealTotals(dealId);
  revalidatePath(`/admin/crm/deals/${dealId}`);
  return { error: null, success: true };
}

export async function updateDealLine(
  _prevState: DealMutationResult | null,
  formData: FormData,
): Promise<DealMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const id = formData.get("dealLineId") as string;
  if (!id) return { error: "Не передан dealLineId" };

  const existing = (await db.dealLine.findUnique({
    where: { id },
    select: { dealId: true },
  })) as { dealId: string } | null;
  if (!existing) return { error: "Строка не найдена" };

  const description = ((formData.get("description") as string | null) ?? "").trim();
  if (!description) return { error: "Введите описание" };
  const type = ((formData.get("type") as string | null) ?? "LABOR").trim();
  const qty = Number.parseFloat((formData.get("qty") as string) ?? "1") || 1;
  const rawUnitPrice = Number.parseInt((formData.get("unitPrice") as string) ?? "0", 10) || 0;
  const { unitPrice, total } = signedLineTotal(type, qty, rawUnitPrice);

  await db.dealLine.update({
    where: { id },
    data: {
      description,
      type: type as never,
      qty,
      unitPrice,
      total,
    },
  });

  await recomputeDealTotals(existing.dealId);
  revalidatePath(`/admin/crm/deals/${existing.dealId}`);
  return { error: null, success: true };
}

export async function deleteDealLine(dealLineId: string): Promise<void> {
  await requireRole(["ADMIN", "MANAGER"]);
  const existing = (await db.dealLine.findUnique({
    where: { id: dealLineId },
    select: { dealId: true },
  })) as { dealId: string } | null;
  if (!existing) return;
  await db.dealLine.delete({ where: { id: dealLineId } });
  await recomputeDealTotals(existing.dealId);
  revalidatePath(`/admin/crm/deals/${existing.dealId}`);
}

interface SetStageResult {
  error: string | null;
}

const FORWARD_FROM: Record<string, ReadonlyArray<string>> = {
  DRAFT: ["QUOTED", "APPROVED", "LOST"],
  QUOTED: ["APPROVED", "LOST"],
  APPROVED: ["IN_FULFILLMENT", "LOST"],
  IN_FULFILLMENT: ["DELIVERED", "LOST"],
  DELIVERED: ["WON", "LOST"],
  WON: [],
  LOST: [],
};

export async function setDealStage(
  dealId: string,
  nextStage: string,
  lostReason?: string,
): Promise<SetStageResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const deal = (await db.deal.findUnique({
    where: { id: dealId },
    select: { stage: true },
  })) as { stage: string } | null;
  if (!deal) return { error: "Сделка не найдена" };

  const allowed = FORWARD_FROM[deal.stage] ?? [];
  if (!allowed.includes(nextStage)) {
    if (session.permissionRole !== "ADMIN") {
      return { error: "Этот переход требует прав ADMIN" };
    }
  }

  const data: Record<string, unknown> = { stage: nextStage };
  const now = new Date();
  if (nextStage === "QUOTED") data.quotedAt = now;
  if (nextStage === "APPROVED") data.approvedAt = now;
  if (nextStage === "WON" || nextStage === "LOST") {
    data.closedAt = now;
    if (nextStage === "LOST" && lostReason) data.lostReason = lostReason;
  }

  await db.deal.update({ where: { id: dealId }, data });
  revalidatePath(`/admin/crm/deals/${dealId}`);
  revalidatePath("/admin/crm/deals");
  return { error: null };
}
