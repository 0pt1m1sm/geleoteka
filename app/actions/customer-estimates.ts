"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { releasePartLinesForEstimate } from "@/lib/fulfillment/reservations";
import { dispatchFulfillment } from "@/lib/crm/public";
import { tokensMatch } from "@/lib/tokens";

interface Result {
  error: string | null;
  success?: boolean;
}

/**
 * Customer accepts an estimate (logged-in owner, or guest with a matching
 * claimToken). Only a SENT estimate is actionable. On approval: estimate →
 * APPROVED, deal → IN_PROGRESS (clearing any close state), any other APPROVED
 * estimate on the deal is superseded and its reservations released, and the
 * channel's fulfillment row is created if absent — same contract as the manager
 * approveEstimate. Serialized per-deal so concurrent approvals can't double it.
 */
export async function customerApproveEstimate(
  estimateId: string,
  claimToken: string | null,
): Promise<Result> {
  const session = await getSession();

  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      stage: true,
      dealId: true,
      total: true,
      deal: {
        select: {
          id: true,
          channel: true,
          customerUserId: true,
          vehicleId: true,
          claimToken: true,
          customer: { select: { name: true, phone: true, email: true } },
        },
      },
    },
  })) as
    | {
        id: string;
        stage: string;
        dealId: string;
        total: number;
        deal: {
          id: string;
          channel: string;
          customerUserId: string;
          vehicleId: string | null;
          claimToken: string | null;
          customer: { name: string; phone: string; email: string };
        };
      }
    | null;

  if (!est) return { error: "Смета не найдена" };
  // Customers act only on a SENT estimate — an unsent DRAFT was never shown to them.
  if (est.stage !== "SENT") return { error: "Смета недоступна для согласования" };

  const isOwner = !!session?.id && session.id === est.deal.customerUserId;
  const isValidGuest = tokensMatch(claimToken, est.deal.claimToken);
  if (!isOwner && !isValidGuest) return { error: "Нет доступа к этой смете" };

  const actor = session?.id;
  const now = new Date();
  const raced = await db.$transaction(async (tx) => {
    // Serialize approvals on this deal so the fulfillment-existence read is fresh.
    await tx.$queryRaw`SELECT id FROM "Deal" WHERE id = ${est.deal.id} FOR UPDATE`;
    const won = await tx.estimate.updateMany({
      where: { id: estimateId, stage: "SENT" },
      data: { stage: "APPROVED", approvedAt: now },
    });
    if (won.count === 0) return true;

    await tx.deal.update({
      where: { id: est.deal.id },
      data: { stage: "IN_PROGRESS", approvedAt: now, closedAt: null, lostReason: null },
    });

    // One APPROVED estimate per deal: supersede any other + release its holds.
    const others = (await tx.estimate.findMany({
      where: { dealId: est.deal.id, stage: "APPROVED", id: { not: estimateId } },
      select: { id: true },
    })) as Array<{ id: string }>;
    for (const o of others) {
      await tx.estimate.update({ where: { id: o.id }, data: { stage: "SUPERSEDED" } });
      await releasePartLinesForEstimate(tx, o.id, actor);
    }

    // Auto-create the channel's fulfillment if absent (fresh existence read).
    const fresh = (await tx.deal.findUnique({
      where: { id: est.deal.id },
      select: {
        repairOrders: { select: { id: true }, take: 1 },
        partShipments: { select: { id: true }, take: 1 },
      },
    })) as { repairOrders: Array<{ id: string }>; partShipments: Array<{ id: string }> } | null;
    await dispatchFulfillment(tx, {
      dealId: est.deal.id,
      channel: est.deal.channel,
      customerUserId: est.deal.customerUserId,
      vehicleId: est.deal.vehicleId,
      contact: est.deal.customer,
      estimateTotal: est.total,
      hasRepairOrder: (fresh?.repairOrders.length ?? 0) > 0,
      hasPartShipment: (fresh?.partShipments.length ?? 0) > 0,
    });
    return false;
  });
  if (raced) return { error: "Смета недоступна для согласования" };

  revalidatePath(`/admin/crm/deals/${est.dealId}`);
  revalidatePath(`/admin/crm/estimates/${estimateId}`);
  revalidatePath(`/cabinet/estimates`);
  revalidatePath(`/cabinet/estimates/${estimateId}`);
  return { error: null, success: true };
}

export async function customerDeclineEstimate(
  estimateId: string,
  reason: string,
  claimToken: string | null,
): Promise<Result> {
  const session = await getSession();

  const trimmed = reason.trim();
  if (!trimmed) return { error: "Укажите причину" };

  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      stage: true,
      dealId: true,
      deal: { select: { customerUserId: true, claimToken: true } },
    },
  })) as
    | { id: string; stage: string; dealId: string; deal: { customerUserId: string; claimToken: string | null } }
    | null;

  if (!est) return { error: "Смета не найдена" };
  if (est.stage !== "SENT") return { error: "Смета недоступна для отклонения" };

  const isOwner = !!session?.id && session.id === est.deal.customerUserId;
  const isValidGuest = tokensMatch(claimToken, est.deal.claimToken);
  if (!isOwner && !isValidGuest) return { error: "Нет доступа к этой смете" };

  const now = new Date();
  const raced = await db.$transaction(async (tx) => {
    // CAS so a concurrent approve/decline can't double-process — and the
    // reservation release runs exactly once (manager declineEstimate does the same).
    const won = await tx.estimate.updateMany({
      where: { id: estimateId, stage: "SENT" },
      data: { stage: "DECLINED", declinedAt: now, declineReason: trimmed },
    });
    if (won.count === 0) return true;
    await releasePartLinesForEstimate(tx, estimateId, session?.id);
    return false;
  });
  if (raced) return { error: "Смета недоступна для отклонения" };

  revalidatePath(`/admin/crm/deals/${est.dealId}`);
  revalidatePath(`/admin/crm/estimates/${estimateId}`);
  revalidatePath(`/cabinet/estimates`);
  revalidatePath(`/cabinet/estimates/${estimateId}`);
  return { error: null, success: true };
}
