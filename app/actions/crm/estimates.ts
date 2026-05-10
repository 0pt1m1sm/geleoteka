"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

interface EstimateMutationResult {
  error: string | null;
  estimateId?: string;
}

/**
 * Snapshot the current state of a Deal into a new Estimate (DRAFT).
 *
 * The Estimate is a frozen sales contract: line items, totals, validity.
 * Subsequent edits to the underlying DealLine[] do NOT propagate to the
 * Estimate — that's the whole point of the snapshot. To capture new
 * scope, the manager creates a revision (`reviseEstimate`).
 */
export async function createEstimate(
  _prev: EstimateMutationResult | null,
  formData: FormData,
): Promise<EstimateMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const dealId = formData.get("dealId") as string;
  if (!dealId) return { error: "Не передан dealId" };

  const deal = (await db.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      stage: true,
      subtotalLabor: true,
      subtotalParts: true,
      subtotalRental: true,
      discount: true,
      tax: true,
      total: true,
      dealLines: {
        orderBy: { sortOrder: "asc" },
        select: {
          sortOrder: true,
          type: true,
          description: true,
          qty: true,
          unitPrice: true,
          total: true,
          partId: true,
        },
      },
    },
  })) as
    | {
        id: string;
        stage: string;
        subtotalLabor: number;
        subtotalParts: number;
        subtotalRental: number;
        discount: number;
        tax: number;
        total: number;
        dealLines: Array<{
          sortOrder: number;
          type: string;
          description: string;
          qty: number;
          unitPrice: number;
          total: number;
          partId: string | null;
        }>;
      }
    | null;

  if (!deal) return { error: "Сделка не найдена" };
  if (deal.dealLines.length === 0) {
    return { error: "Добавьте хотя бы одну позицию перед созданием сметы" };
  }

  const validDaysRaw = formData.get("validDays") as string | null;
  const validDays = validDaysRaw ? Number.parseInt(validDaysRaw, 10) : 14;
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + (Number.isNaN(validDays) ? 14 : validDays));

  const notes = ((formData.get("notes") as string | null) ?? "").trim() || null;
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const estimate = (await db.estimate.create({
    data: {
      dealId: deal.id,
      stage: "DRAFT",
      preparedByUserId: session.id,
      validUntil,
      notes,
      subtotalLabor: deal.subtotalLabor,
      subtotalParts: deal.subtotalParts,
      subtotalRental: deal.subtotalRental,
      discount: deal.discount,
      tax: deal.tax,
      total: deal.total,
      estimateLines: {
        create: deal.dealLines.map((l) => ({
          sortOrder: l.sortOrder,
          type: l.type as never,
          description: l.description,
          qty: l.qty,
          unitPrice: l.unitPrice,
          total: l.total,
          partId: l.partId,
        })),
      },
    },
    select: { id: true },
  })) as { id: string };

  revalidatePath(`/admin/crm/deals/${deal.id}`);
  return { error: null, estimateId: estimate.id };
}

/** Mark estimate as SENT; bump Deal.stage to QUOTED if still DRAFT. */
export async function sendEstimate(estimateId: string): Promise<EstimateMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, dealId: true, stage: true },
  })) as { id: string; dealId: string; stage: string } | null;
  if (!est) return { error: "Смета не найдена" };
  if (est.stage !== "DRAFT") {
    return { error: "Смета уже отправлена или закрыта" };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.estimate.update({
      where: { id: estimateId },
      data: { stage: "SENT", sentAt: now },
    });
    const deal = (await tx.deal.findUnique({
      where: { id: est.dealId },
      select: { stage: true },
    })) as { stage: string } | null;
    if (deal && (deal.stage === "DRAFT" || deal.stage === null)) {
      await tx.deal.update({
        where: { id: est.dealId },
        data: { stage: "QUOTED", quotedAt: now },
      });
    }
  });

  revalidatePath(`/admin/crm/deals/${est.dealId}`);
  revalidatePath(`/admin/crm/estimates/${estimateId}`);
  return { error: null, estimateId };
}

/**
 * Customer accepted the estimate. Advances Deal QUOTED → APPROVED and
 * flags the estimate APPROVED. Fulfillment dispatch (creating a fresh
 * RepairOrder / PartShipment for the deal channel if one doesn't exist
 * yet) is handled by a separate step — most flows already have a
 * fulfillment row created at booking time.
 */
export async function approveEstimate(estimateId: string): Promise<EstimateMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, dealId: true, stage: true },
  })) as { id: string; dealId: string; stage: string } | null;
  if (!est) return { error: "Смета не найдена" };
  if (est.stage !== "DRAFT" && est.stage !== "SENT") {
    return { error: "Смету в этой стадии нельзя согласовать" };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.estimate.update({
      where: { id: estimateId },
      data: { stage: "APPROVED", approvedAt: now },
    });
    await tx.deal.update({
      where: { id: est.dealId },
      data: { stage: "APPROVED", approvedAt: now },
    });
  });

  revalidatePath(`/admin/crm/deals/${est.dealId}`);
  revalidatePath(`/admin/crm/estimates/${estimateId}`);
  return { error: null, estimateId };
}

export async function declineEstimate(
  estimateId: string,
  reason: string,
): Promise<EstimateMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "Укажите причину отказа" };

  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, dealId: true, stage: true },
  })) as { id: string; dealId: string; stage: string } | null;
  if (!est) return { error: "Смета не найдена" };
  if (est.stage !== "DRAFT" && est.stage !== "SENT") {
    return { error: "Смету в этой стадии нельзя отклонить" };
  }

  const now = new Date();
  await db.estimate.update({
    where: { id: estimateId },
    data: { stage: "DECLINED", declinedAt: now, declineReason: trimmedReason },
  });

  revalidatePath(`/admin/crm/deals/${est.dealId}`);
  revalidatePath(`/admin/crm/estimates/${estimateId}`);
  return { error: null, estimateId };
}

/**
 * Clone an estimate into a fresh DRAFT child, mark the parent SUPERSEDED.
 * Used when the original was sent but needs to be re-issued (price changed,
 * scope expanded, etc.). The new estimate snapshots the *current* Deal
 * lines, not the parent's frozen lines — so it picks up any DealLine
 * edits made since.
 */
export async function reviseEstimate(estimateId: string): Promise<EstimateMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const parent = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, dealId: true, stage: true },
  })) as { id: string; dealId: string; stage: string } | null;
  if (!parent) return { error: "Смета не найдена" };
  if (parent.stage === "APPROVED") {
    return { error: "Согласованную смету нельзя пересмотреть. Создайте новую сделку." };
  }
  if (parent.stage === "SUPERSEDED") {
    return { error: "Смета уже была пересмотрена" };
  }

  const deal = (await db.deal.findUnique({
    where: { id: parent.dealId },
    select: {
      subtotalLabor: true,
      subtotalParts: true,
      subtotalRental: true,
      discount: true,
      tax: true,
      total: true,
      dealLines: {
        orderBy: { sortOrder: "asc" },
        select: {
          sortOrder: true,
          type: true,
          description: true,
          qty: true,
          unitPrice: true,
          total: true,
          partId: true,
        },
      },
    },
  })) as
    | {
        subtotalLabor: number;
        subtotalParts: number;
        subtotalRental: number;
        discount: number;
        tax: number;
        total: number;
        dealLines: Array<{
          sortOrder: number;
          type: string;
          description: string;
          qty: number;
          unitPrice: number;
          total: number;
          partId: string | null;
        }>;
      }
    | null;
  if (!deal) return { error: "Сделка не найдена" };

  const session = await requireRole(["ADMIN", "MANAGER"]);
  const child = await db.$transaction(async (tx) => {
    const created = (await tx.estimate.create({
      data: {
        dealId: parent.dealId,
        stage: "DRAFT",
        parentEstimateId: parent.id,
        preparedByUserId: session.id,
        subtotalLabor: deal.subtotalLabor,
        subtotalParts: deal.subtotalParts,
        subtotalRental: deal.subtotalRental,
        discount: deal.discount,
        tax: deal.tax,
        total: deal.total,
        estimateLines: {
          create: deal.dealLines.map((l) => ({
            sortOrder: l.sortOrder,
            type: l.type as never,
            description: l.description,
            qty: l.qty,
            unitPrice: l.unitPrice,
            total: l.total,
            partId: l.partId,
          })),
        },
      },
      select: { id: true },
    })) as { id: string };

    await tx.estimate.update({
      where: { id: parent.id },
      data: { stage: "SUPERSEDED" },
    });
    return created;
  });

  revalidatePath(`/admin/crm/deals/${parent.dealId}`);
  revalidatePath(`/admin/crm/estimates/${parent.id}`);
  return { error: null, estimateId: child.id };
}
