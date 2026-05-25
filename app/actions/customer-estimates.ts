"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { releasePartLinesForEstimate } from "@/lib/fulfillment/reservations";

interface Result {
  error: string | null;
  success?: boolean;
}

/**
 * Customer accepts an estimate. Two auth modes:
 *  - Logged-in customer: session must own the estimate's deal.
 *  - Guest: `claimToken` must match `Deal.claimToken` (one-shot
 *    secret returned at booking time).
 *
 * Either path:
 *  - Estimate stage → APPROVED
 *  - Deal stage → APPROVED
 *  - Both `approvedAt` timestamps set
 *
 * Note: we don't clear `claimToken` here — the same token also gates
 * the post-checkout account-claim flow, which is a separate user-facing
 * step. Token clears in the existing claimAccount action.
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
      deal: {
        select: {
          id: true,
          customerUserId: true,
          claimToken: true,
        },
      },
    },
  })) as
    | {
        id: string;
        stage: string;
        dealId: string;
        deal: { id: string; customerUserId: string; claimToken: string | null };
      }
    | null;

  if (!est) return { error: "Смета не найдена" };
  if (est.stage !== "DRAFT" && est.stage !== "SENT") {
    return { error: "Смета уже закрыта" };
  }

  const isOwner = session?.id === est.deal.customerUserId;
  const isValidGuest =
    !!claimToken && claimToken === est.deal.claimToken;
  if (!isOwner && !isValidGuest) {
    return { error: "Нет доступа к этой смете" };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.estimate.update({
      where: { id: estimateId },
      data: { stage: "APPROVED", approvedAt: now },
    });
    await tx.deal.update({
      where: { id: est.dealId },
      data: { stage: "IN_PROGRESS", approvedAt: now },
    });
  });

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
      deal: {
        select: { customerUserId: true, claimToken: true },
      },
    },
  })) as
    | {
        id: string;
        stage: string;
        dealId: string;
        deal: { customerUserId: string; claimToken: string | null };
      }
    | null;

  if (!est) return { error: "Смета не найдена" };
  if (est.stage !== "DRAFT" && est.stage !== "SENT") {
    return { error: "Смета уже закрыта" };
  }

  const isOwner = session?.id === est.deal.customerUserId;
  const isValidGuest = !!claimToken && claimToken === est.deal.claimToken;
  if (!isOwner && !isValidGuest) {
    return { error: "Нет доступа к этой смете" };
  }

  const now = new Date();
  const raced = await db.$transaction(async (tx) => {
    // CAS on the stage so a concurrent approve/decline can't double-process —
    // and the reservation release below runs exactly once. Mirrors the manager
    // declineEstimate path, which previously was the ONLY one that released holds.
    const won = await tx.estimate.updateMany({
      where: { id: estimateId, stage: { in: ["DRAFT", "SENT"] } },
      data: { stage: "DECLINED", declinedAt: now, declineReason: trimmed },
    });
    if (won.count === 0) return true;
    // DRAFT/SENT held PART-line reservations — release them now the estimate is dead.
    await releasePartLinesForEstimate(tx, estimateId, session?.id);
    return false;
  });
  if (raced) return { error: "Смета уже закрыта" };

  revalidatePath(`/admin/crm/deals/${est.dealId}`);
  revalidatePath(`/admin/crm/estimates/${estimateId}`);
  revalidatePath(`/cabinet/estimates`);
  revalidatePath(`/cabinet/estimates/${estimateId}`);
  return { error: null, success: true };
}
