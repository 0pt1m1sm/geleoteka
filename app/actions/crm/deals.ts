"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recomputeDealTotals } from "@/lib/crm/internal/recompute-deal-totals";

interface DealMutationResult {
  error: string | null;
  success?: boolean;
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
  const unitPrice = Number.parseInt((formData.get("unitPrice") as string) ?? "0", 10) || 0;
  const partId = ((formData.get("partId") as string | null) ?? "").trim() || null;

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
      total: Math.round(qty * unitPrice),
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
  const unitPrice = Number.parseInt((formData.get("unitPrice") as string) ?? "0", 10) || 0;

  await db.dealLine.update({
    where: { id },
    data: {
      description,
      type: type as never,
      qty,
      unitPrice,
      total: Math.round(qty * unitPrice),
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
