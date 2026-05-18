"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

interface EstimateMutationResult {
  error: string | null;
  estimateId?: string;
}

/**
 * "Open or create the active draft estimate" for a deal.
 *
 * Post-refactor (2026-05-18) every deal already has an initial DRAFT
 * estimate created at deal creation time (see `lib/crm/public/create-deal`).
 * This action is the deal-page "+ Новая смета" entry point — it picks the
 * right behaviour for the deal's current estimate state:
 *
 *   - DRAFT exists → return its id (navigate user to the editor)
 *   - Latest non-SUPERSEDED is SENT/APPROVED/DECLINED/EXPIRED → revise it
 *     (creates a new DRAFT cloned from that estimate's lines and marks the
 *     parent SUPERSEDED via `reviseEstimate`)
 *   - No estimates at all (legacy data) → create blank DRAFT
 */
export async function openOrCreateActiveEstimate(
  _prev: EstimateMutationResult | null,
  formData: FormData,
): Promise<EstimateMutationResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const dealId = formData.get("dealId") as string;
  if (!dealId) return { error: "Не передан dealId" };

  const deal = (await db.deal.findUnique({
    where: { id: dealId },
    select: { id: true },
  })) as { id: string } | null;
  if (!deal) return { error: "Сделка не найдена" };

  // Look for an existing DRAFT first — that's the active working basket.
  const existingDraft = (await db.estimate.findFirst({
    where: { dealId, stage: "DRAFT" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })) as { id: string } | null;
  if (existingDraft) {
    return { error: null, estimateId: existingDraft.id };
  }

  // No DRAFT — find the latest non-SUPERSEDED estimate and revise it.
  const latest = (await db.estimate.findFirst({
    where: { dealId, stage: { not: "SUPERSEDED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })) as { id: string } | null;
  if (latest) {
    return reviseEstimate(latest.id);
  }

  // Legacy fallback: no estimates exist for this deal. Create a blank DRAFT.
  const created = (await db.estimate.create({
    data: { dealId, stage: "DRAFT", preparedByUserId: session.id },
    select: { id: true },
  })) as { id: string };
  revalidatePath(`/admin/crm/deals/${dealId}`);
  return { error: null, estimateId: created.id };
}

/** Mark estimate as SENT; bump Deal.stage to QUOTED if still DRAFT. */
export async function sendEstimate(estimateId: string): Promise<EstimateMutationResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, dealId: true, stage: true },
  })) as { id: string; dealId: string; stage: string } | null;
  if (!est) return { error: "Смета не найдена" };
  if (est.stage !== "DRAFT") {
    return { error: "Смета уже отправлена или закрыта" };
  }

  const now = new Date();
  // Idempotent transition: updateMany with stage="DRAFT" guard so two
  // concurrent "Отправить клиенту" clicks don't both succeed → the email
  // dispatch below runs only when THIS request did the actual transition.
  let transitioned = false;
  await db.$transaction(async (tx) => {
    const result = (await tx.estimate.updateMany({
      where: { id: estimateId, stage: "DRAFT" },
      data: { stage: "SENT", sentAt: now },
    })) as { count: number };
    transitioned = result.count === 1;
    if (!transitioned) return;
    // Post-collapse: deal stage stays NEW when sending; only approveEstimate
    // promotes it to IN_PROGRESS. Just stamp quotedAt for reporting.
    await tx.deal.update({
      where: { id: est.dealId },
      data: { quotedAt: now },
    });
  });

  // Lost the race — another concurrent request already sent this estimate.
  // Return success silently; the customer email was dispatched once.
  if (!transitioned) return { error: null, estimateId };

  revalidatePath(`/admin/crm/deals/${est.dealId}`);
  revalidatePath(`/admin/crm/estimates/${estimateId}`);

  // Fire-and-forget customer email. Separate query keeps the SENT-transition
  // transaction small; failure here must not affect the action's success.
  //
  // URL selection: the token-based URL (`/estimate/<token>?id=<estimateId>` +
  // `/api/estimates/<id>/pdf?token=<token>`) is the documented guest-view
  // path — same exposure surface as the existing SMS confirmation, NOT the
  // removed claim-account CTA. When the customer has a real password
  // (`isTempPassword=false`) the cabinet URL is the right choice. Worst
  // case (guest without claim token AND without real password) we omit
  // deep links and let the customer ask the manager.
  const emailPayload = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: {
      number: true,
      total: true,
      validUntil: true,
      deal: {
        select: {
          id: true,
          claimToken: true,
          customer: { select: { id: true, email: true, name: true, isTempPassword: true } },
        },
      },
    },
  })) as
    | {
        number: string | null;
        total: number;
        validUntil: Date | null;
        deal: {
          id: string;
          claimToken: string | null;
          customer: { id: string; email: string; name: string; isTempPassword: boolean };
        };
      }
    | null;
  if (emailPayload?.deal.customer.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
    const token = emailPayload.deal.claimToken;
    const hasRealAccount = !emailPayload.deal.customer.isTempPassword;
    let viewUrl: string | undefined;
    let pdfUrl: string | undefined;
    if (token) {
      viewUrl = `${appUrl}/estimate/${token}?id=${estimateId}`;
      pdfUrl = `${appUrl}/api/estimates/${estimateId}/pdf?token=${token}`;
    } else if (hasRealAccount) {
      viewUrl = `${appUrl}/cabinet/estimates/${estimateId}`;
      pdfUrl = `${appUrl}/api/estimates/${estimateId}/pdf`;
    }
    if (viewUrl && pdfUrl) {
      const {
        sendEstimateSentEmail,
        generateOutboundMessageId,
        recordOutboundEmail,
        markOutboundEmailFailed,
        markOutboundEmailSent,
        isPlausibleEmail,
      } = await import("@/lib/email");
      const estimateNumber = emailPayload.number ?? estimateId.slice(-6).toUpperCase();
      const subject = `Geleoteka — смета №${estimateNumber} на согласование`;
      const bodyText = `Здравствуйте, ${emailPayload.deal.customer.name}. Смета №${estimateNumber} на сумму ${(emailPayload.total / 100).toLocaleString("ru-RU")} ₽. Открыть: ${viewUrl}`;
      const messageId = generateOutboundMessageId();
      // Persist FIRST — primary threading anchor: customer replies to estimates
      // most often, and we must capture externalId before Resend accepts.
      if (isPlausibleEmail(emailPayload.deal.customer.email)) {
        await recordOutboundEmail({
          customerUserId: emailPayload.deal.customer.id,
          dealId: emailPayload.deal.id,
          authorUserId: session.id,
          subject,
          body: bodyText,
          messageId,
        });
      }
      void sendEstimateSentEmail(
        emailPayload.deal.customer.email,
        {
          customerName: emailPayload.deal.customer.name,
          estimateNumber,
          total: emailPayload.total,
          validUntil: emailPayload.validUntil,
          viewUrl,
          pdfUrl,
        },
        { messageId },
      )
        .then((result) => {
          if (!result.success) return markOutboundEmailFailed(messageId, result.error);
          return markOutboundEmailSent(messageId);
        })
        .catch((err) =>
          markOutboundEmailFailed(messageId, err instanceof Error ? err.message : String(err)),
        );
    }
  }

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
      data: { stage: "IN_PROGRESS", approvedAt: now },
    });
  });

  revalidatePath(`/admin/crm/deals/${est.dealId}`);
  revalidatePath(`/admin/crm/estimates/${estimateId}`);
  return { error: null, estimateId };
}

/**
 * Roll an APPROVED estimate back to SENT. Used when the manager hit
 * "Согласовать" by mistake — without this they'd be stuck (revise blocks
 * APPROVED). Returns deal stage to QUOTED so the deal-stage chip matches.
 * Strictly APPROVED-only: other stages stay immutable for audit.
 */
export async function unapproveEstimate(estimateId: string): Promise<EstimateMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, dealId: true, stage: true },
  })) as { id: string; dealId: string; stage: string } | null;
  if (!est) return { error: "Смета не найдена" };
  if (est.stage !== "APPROVED") {
    return { error: "Откатить согласование можно только у согласованной сметы" };
  }

  await db.$transaction(async (tx) => {
    await tx.estimate.update({
      where: { id: estimateId },
      data: { stage: "SENT", approvedAt: null },
    });
    // Roll deal back IN_PROGRESS → NEW. We don't touch WON/LOST: if the
    // deal already closed, manager should reopen via the deal stage UI
    // (setDealStage handles that path with its own audit trail).
    const deal = (await tx.deal.findUnique({
      where: { id: est.dealId },
      select: { stage: true },
    })) as { stage: string } | null;
    if (deal && deal.stage === "IN_PROGRESS") {
      await tx.deal.update({
        where: { id: est.dealId },
        data: { stage: "NEW", approvedAt: null },
      });
    }
  });

  revalidatePath(`/admin/crm/deals/${est.dealId}`);
  revalidatePath(`/admin/crm/estimates/${estimateId}`);
  return { error: null, estimateId };
}

/**
 * Delete an estimate. Soft policy:
 *   - DRAFT / SUPERSEDED → free deletion (no contract value)
 *   - SENT / DECLINED / EXPIRED → permitted with manager confirm at UI
 *   - APPROVED → blocked (contract integrity — must unapprove first)
 *
 * Cascade: EstimateLine[] dropped via Prisma's onDelete: Cascade.
 * Revision chain: if `parentEstimateId` pointed at this row, children get
 * their FK set to null (SetNull) — chain breaks but children survive.
 */
export async function deleteEstimate(estimateId: string): Promise<EstimateMutationResult> {
  await requireRole(["ADMIN", "MANAGER"]);

  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, dealId: true, stage: true },
  })) as { id: string; dealId: string; stage: string } | null;
  if (!est) return { error: "Смета не найдена" };
  if (est.stage === "APPROVED") {
    return { error: "Согласованную смету нельзя удалить. Сначала откатите согласование." };
  }

  await db.estimate.delete({ where: { id: estimateId } });

  revalidatePath(`/admin/crm/deals/${est.dealId}`);
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
/**
 * Create a new DRAFT estimate cloned from `estimateId`, and mark the parent
 * SUPERSEDED. The child carries the same line items, subtotals, and notes;
 * the manager edits the new DRAFT, sends it, customer responds, and so on.
 *
 * Cloning source is the parent estimate's `estimateLines` (post-refactor
 * 2026-05-18) — DealLine no longer exists as a separate table.
 */
export async function reviseEstimate(estimateId: string): Promise<EstimateMutationResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const parent = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      dealId: true,
      stage: true,
      subtotalLabor: true,
      subtotalParts: true,
      subtotalRental: true,
      discount: true,
      tax: true,
      total: true,
      notes: true,
      estimateLines: {
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
        dealId: string;
        stage: string;
        subtotalLabor: number;
        subtotalParts: number;
        subtotalRental: number;
        discount: number;
        tax: number;
        total: number;
        notes: string | null;
        estimateLines: Array<{
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
  if (!parent) return { error: "Смета не найдена" };
  if (parent.stage === "APPROVED") {
    return { error: "Согласованную смету нельзя пересмотреть. Создайте новую сделку." };
  }
  if (parent.stage === "SUPERSEDED") {
    return { error: "Смета уже была пересмотрена" };
  }
  if (parent.stage === "DRAFT") {
    // No point cloning a DRAFT — the manager can just keep editing it.
    return { error: null, estimateId: parent.id };
  }

  const child = await db.$transaction(async (tx) => {
    const created = (await tx.estimate.create({
      data: {
        dealId: parent.dealId,
        stage: "DRAFT",
        parentEstimateId: parent.id,
        preparedByUserId: session.id,
        notes: parent.notes,
        subtotalLabor: parent.subtotalLabor,
        subtotalParts: parent.subtotalParts,
        subtotalRental: parent.subtotalRental,
        discount: parent.discount,
        tax: parent.tax,
        total: parent.total,
        estimateLines: {
          create: parent.estimateLines.map((l) => ({
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
