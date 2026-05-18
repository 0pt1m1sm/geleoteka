"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { createDeal as createDealPublic } from "@/lib/crm/public/create-deal";

interface DealMutationResult {
  error: string | null;
  success?: boolean;
  dealId?: string;
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
    initialStage: "NEW",
    notes,
  });

  revalidatePath("/admin/crm/deals");
  redirect(`/admin/crm/deals/${deal.id}`);
}

// addDealLine / updateDealLine / deleteDealLine were removed in the
// 2026-05-18 refactor. The deal page no longer edits lines directly —
// everything lives on the active Estimate now (see
// app/actions/crm/estimate-lines.ts).

interface SetStageResult {
  error: string | null;
}

/**
 * DealStage transitions (4 stages, soft policy):
 *   NEW → IN_PROGRESS (auto, via approveEstimate — no manual transition)
 *   NEW → LOST (manual)
 *   IN_PROGRESS → WON (manual: фулфилмент завершён + оплачено)
 *   IN_PROGRESS → LOST (manual)
 *   WON → IN_PROGRESS (manual rollback: ошиблись с закрытием)
 *   LOST → NEW (manual rollback: клиент вернулся)
 */
const FORWARD_FROM: Record<string, ReadonlyArray<string>> = {
  NEW: ["LOST"],
  IN_PROGRESS: ["WON", "LOST"],
  WON: ["IN_PROGRESS"],
  LOST: ["NEW"],
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
  if (nextStage === "IN_PROGRESS") {
    // Coming from WON rollback OR auto-set by approveEstimate.
    data.approvedAt = now;
    data.closedAt = null;
  }
  if (nextStage === "WON" || nextStage === "LOST") {
    data.closedAt = now;
    if (nextStage === "LOST" && lostReason) data.lostReason = lostReason;
  }
  if (nextStage === "NEW") {
    // Rollback from LOST. Clear close timestamps so list filters treat as open.
    data.closedAt = null;
    data.lostReason = null;
  }

  await db.deal.update({ where: { id: dealId }, data });
  revalidatePath(`/admin/crm/deals/${dealId}`);
  revalidatePath("/admin/crm/deals");
  return { error: null };
}

/**
 * Delete a deal. Soft policy:
 *   - WON → blocked (commercial history; rollback to IN_PROGRESS first)
 *   - any other stage → permitted with confirm at the UI
 *
 * Cascades: Estimate[] (and their EstimateLine[]) drop via onDelete: Cascade.
 * Fulfillment rows (RepairOrder/PartOrder/RentalBooking) keep their dealId
 * column NULL via onDelete: SetNull — work history survives, the commercial
 * thread is gone.
 */
export async function deleteDeal(dealId: string): Promise<SetStageResult> {
  await requireRole(["ADMIN", "MANAGER"]);
  const deal = (await db.deal.findUnique({
    where: { id: dealId },
    select: { stage: true },
  })) as { stage: string } | null;
  if (!deal) return { error: "Сделка не найдена" };
  if (deal.stage === "WON") {
    return { error: "Выигранную сделку нельзя удалить. Сначала откатите её в «В работе»." };
  }
  await db.deal.delete({ where: { id: dealId } });
  revalidatePath("/admin/crm/deals");
  return { error: null };
}
