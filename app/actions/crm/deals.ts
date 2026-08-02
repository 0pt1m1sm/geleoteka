"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { createDeal as createDealPublic } from "@/lib/crm/public/create-deal";
import { releasePartLinesForEstimate } from "@/lib/fulfillment/reservations";
import { actorId } from "@/lib/wms-host";

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

  await recordAudit({
    actor: session,
    action: "deal.create",
    targetType: "Deal",
    targetId: deal.id,
    targetLabel: deal.number ?? deal.id,
    metadata: {
      customerUserId: customer.id,
      vehicleId,
      channel,
      source,
    },
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
    select: { stage: true, total: true, customerUserId: true },
  })) as { stage: string; total: number; customerUserId: string } | null;
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

  const raced = await db.$transaction(async (tx) => {
    // CAS on the observed stage: a concurrent double-submit (e.g. double-click
    // on the Kanban WON column) matches 0 rows on the loser, so the
    // lifetimeValue adjustment below runs exactly once per real transition —
    // and the stage update + LTV upsert commit atomically (audit finding C3).
    // where cast to a loose record (matches `data` above) — `deal.stage` is a
    // valid DealStage at runtime but typed as string through the db singleton.
    const stageWhere = { id: dealId, stage: deal.stage } as Record<string, unknown>;
    const moved = await tx.deal.updateMany({ where: stageWhere, data });
    if (moved.count === 0) return true;

    // Maintain CustomerProfile.lifetimeValue across the WON boundary so it stays
    // in sync without a full recompute (mirrors the WON/rollback transitions).
    //
    // A detached deal has no profile to bill the value to, and passing a null id
    // to this upsert is a Prisma validation error, so closing out old paperwork
    // for an erased customer would throw. The stage still moves; only the
    // lifetime-value bookkeeping is skipped, which is correct — there is no
    // customer left whose lifetime value it could belong to.
    if (deal.customerUserId === null) {
      return false;
    }

    if (nextStage === "WON" && deal.stage !== "WON") {
      await tx.customerProfile.upsert({
        where: { userId: deal.customerUserId },
        update: { lifetimeValue: { increment: deal.total }, lastTouchAt: now },
        create: { userId: deal.customerUserId, lifetimeValue: deal.total, lastTouchAt: now, firstSeenAt: now },
      });
    } else if (deal.stage === "WON" && nextStage !== "WON") {
      await tx.customerProfile.upsert({
        where: { userId: deal.customerUserId },
        update: { lifetimeValue: { decrement: deal.total }, lastTouchAt: now },
        create: { userId: deal.customerUserId, lifetimeValue: 0, lastTouchAt: now, firstSeenAt: now },
      });
    }
    return false;
  });
  if (raced) return { error: "Сделка уже изменена — обновите страницу" };

  revalidatePath(`/admin/crm/deals/${dealId}`);
  revalidatePath("/admin/crm/deals");
  return { error: null };
}

/**
 * Delete a deal — only ever a way to remove a mistake, never a way to close one out.
 *
 * WON is blocked outright — roll it back to IN_PROGRESS first.
 *
 * A deal that produced fulfillment (repair order, shipment, rental) needs
 * `deleteFulfillment: true`, which the UI asks for with a checkbox that is off
 * by default. Deleting is a legitimate way to undo a deal entered wrongly —
 * often faster than editing every field — so this is a confirmation, not a ban.
 *
 * The docstring this replaces was actively misleading: it claimed fulfillment
 * rows "keep their dealId column NULL via onDelete: SetNull — work history
 * survives". The schema says `Cascade`. Deleting an in-progress deal destroyed
 * the repair order, its job/labor/part lines, its slot, its work photos, the
 * shipment and every estimate — while the comment above the live button
 * promised the opposite.
 *
 * Estimates DO still cascade — an estimate belongs to its deal — but their
 * stock reservations are released first, because those are keyed by a string,
 * not a foreign key, and the database cascade cannot see them. Only holds that
 * are still outstanding come back: parts already fitted or shipped were
 * consumed, which cleared their hold when the stock physically left.
 */
export async function deleteDeal(
  dealId: string,
  options: { deleteFulfillment?: boolean } = {},
): Promise<SetStageResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const deal = (await db.deal.findUnique({
    where: { id: dealId },
    select: {
      stage: true,
      number: true,
      total: true,
      _count: { select: { repairOrders: true, partShipments: true, rentalBookings: true } },
    },
  })) as {
    stage: string;
    number: string | null;
    total: number;
    _count: { repairOrders: number; partShipments: number; rentalBookings: number };
  } | null;
  if (!deal) return { error: "Сделка не найдена" };
  if (deal.stage === "WON") {
    return { error: "Выигранную сделку нельзя удалить. Сначала откатите её в «В работе»." };
  }

  const fulfilments =
    deal._count.repairOrders + deal._count.partShipments + deal._count.rentalBookings;
  if (fulfilments > 0 && options.deleteFulfillment !== true) {
    return {
      error:
        `По сделке есть исполнение (${fulfilments}): заказ-наряд, отгрузка или аренда. ` +
        "Удаление уничтожит и их вместе с работами и фотографиями. Подтвердите галочкой, если сделка заведена ошибочно.",
    };
  }

  const estimates = (await db.estimate.findMany({
    where: { dealId },
    select: { id: true },
  })) as Array<{ id: string }>;

  await db.$transaction(async (tx) => {
    // Reservations are held per estimate line under a string source id; the
    // cascade below cannot release them, so do it explicitly first.
    for (const est of estimates) {
      await releasePartLinesForEstimate(tx, est.id, actorId(session));
    }
    await tx.deal.delete({ where: { id: dealId } });
    await recordAudit(
      {
        actor: session,
        action: "deal.delete",
        targetType: "Deal",
        targetId: dealId,
        targetLabel: deal.number ?? dealId,
        // The sum and the fulfillment count are what make a deletion worth
        // questioning later; the stage says whether it was live.
        metadata: {
          stage: deal.stage,
          total: deal.total,
          deleteFulfillment: options.deleteFulfillment === true,
          fulfilments,
          estimates: estimates.length,
        },
      },
      tx,
    );
  });

  revalidatePath("/admin/crm/deals");
  return { error: null };
}
