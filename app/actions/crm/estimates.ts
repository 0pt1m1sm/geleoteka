"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { nextEstimateNumber, dispatchFulfillment, recomputeEstimateTotals } from "@/lib/crm/public";
import {
  releasePartLinesForEstimate,
  reservePartLinesForEstimate,
} from "@/lib/fulfillment/reservations";
import { actorId } from "@/lib/wms-host";

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

  // No DRAFT — find the latest non-SUPERSEDED estimate.
  const latest = (await db.estimate.findFirst({
    where: { dealId, stage: { not: "SUPERSEDED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, stage: true },
  })) as { id: string; stage: string } | null;

  // SENT / DECLINED / EXPIRED → revise: clone into a new DRAFT child and
  // mark the parent SUPERSEDED. The lifecycle says these stages are
  // either still live or already settled-negative — overwriting them is
  // fine.
  //
  // APPROVED → DO NOT revise. Revision marks the parent SUPERSEDED, which
  // destroys the contract-signed snapshot. Instead, create a fresh blank
  // DRAFT as a sibling. Manager keeps the approved contract intact and
  // builds a new estimate from scratch. recompute-deal-totals will pick
  // the DRAFT as active (DRAFT > APPROVED in its priority table), so the
  // deal total reflects the work-in-progress view.
  if (latest && latest.stage !== "APPROVED") {
    return reviseEstimate(latest.id);
  }

  // No estimates yet, OR latest is APPROVED — create a blank DRAFT.
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
  if (!emailPayload?.deal.customer.email) {
    return { error: null, estimateId };
  }

  const {
    sendEstimateSentEmail,
    generateOutboundMessageId,
    recordOutboundEmail,
    markOutboundEmailFailed,
    markOutboundEmailSent,
    isPlausibleEmail,
  } = await import("@/lib/email");

  if (!isPlausibleEmail(emailPayload.deal.customer.email)) {
    return {
      error: "У клиента не указан корректный email — отправьте смету ссылкой вручную",
      estimateId,
    };
  }

  const { buildEstimateEmailLinks } = await import("./estimates-email-links");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";
  const { viewUrl, pdfUrl } = buildEstimateEmailLinks({
    appUrl,
    estimateId,
    dealClaimToken: emailPayload.deal.claimToken,
  });

  const estimateNumber = emailPayload.number ?? estimateId.slice(-6).toUpperCase();
  const subject = `Geleoteka — смета №${estimateNumber} на согласование`;
  const bodyText = `Здравствуйте, ${emailPayload.deal.customer.name}. Смета №${estimateNumber} на сумму ${(emailPayload.total / 100).toLocaleString("ru-RU")} ₽. Открыть: ${viewUrl}`;
  const messageId = generateOutboundMessageId();
  // Persist FIRST — primary threading anchor: customer replies to estimates
  // most often, and we must capture externalId before Resend accepts.
  await recordOutboundEmail({
    customerUserId: emailPayload.deal.customer.id,
    dealId: emailPayload.deal.id,
    authorUserId: session.id,
    subject,
    body: bodyText,
    messageId,
  });

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
  const session = await requireRole(["ADMIN", "MANAGER"]);

  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      stage: true,
      total: true,
      deal: {
        select: {
          id: true,
          channel: true,
          customerUserId: true,
          vehicleId: true,
          customer: { select: { name: true, phone: true, email: true } },
        },
      },
    },
  })) as {
    id: string;
    stage: string;
    total: number;
    deal: {
      id: string;
      channel: string;
      customerUserId: string;
      vehicleId: string | null;
      customer: { name: string; phone: string; email: string };
    };
  } | null;
  if (!est) return { error: "Смета не найдена" };
  if (est.stage !== "DRAFT" && est.stage !== "SENT") {
    return { error: "Смету в этой стадии нельзя согласовать" };
  }

  const now = new Date();
  const raced = await db.$transaction(async (tx) => {
    // Serialize all approvals on this deal so the fulfillment-existence read
    // below can't see a stale (pre-create) value and double-create a
    // RepairOrder/PartShipment under concurrency (audit finding C1).
    await tx.$queryRaw`SELECT id FROM "Deal" WHERE id = ${est.deal.id} FOR UPDATE`;

    // CAS: exactly one approval transitions DRAFT/SENT → APPROVED. A concurrent
    // double-submit matches 0 rows and short-circuits — no second dispatch.
    const won = await tx.estimate.updateMany({
      where: { id: estimateId, stage: { in: ["DRAFT", "SENT"] } },
      data: { stage: "APPROVED", approvedAt: now },
    });
    if (won.count === 0) return true;

    await tx.deal.update({
      where: { id: est.deal.id },
      // Clear close state: approving a (re-opened) estimate on a WON/LOST deal
      // must not leave a stale closedAt/lostReason behind (audit finding C6).
      data: { stage: "IN_PROGRESS", approvedAt: now, closedAt: null, lostReason: null },
    });

    // One APPROVED estimate per deal: supersede any other currently-APPROVED
    // estimate and release its held reservations. WMS pick/pack reads the single
    // APPROVED estimate; two would feed it stale lines (audit finding C7).
    const others = (await tx.estimate.findMany({
      where: { dealId: est.deal.id, stage: "APPROVED", id: { not: estimateId } },
      select: { id: true },
    })) as Array<{ id: string }>;
    for (const o of others) {
      await tx.estimate.update({ where: { id: o.id }, data: { stage: "SUPERSEDED" } });
      await releasePartLinesForEstimate(tx, o.id, actorId(session));
    }

    // Re-read fulfillment existence INSIDE the serialized tx (the pre-tx read is
    // stale w.r.t. a concurrent approval) so dispatch stays idempotent.
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
  if (raced) return { error: "Смета уже согласована" };

  revalidatePath(`/admin/crm/deals/${est.deal.id}`);
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
    // Reservation invariant: PART-line holds stay LIVE across the whole
    // DRAFT → SENT → APPROVED span and through this APPROVED → SENT rollback.
    // They are released exactly once, by ONE of: decline/supersede/expire
    // (releasePartLinesForEstimate) or CONSUMPTION at RO/shipment close (which
    // decrements reserved). So unapprove must NOT release here — the estimate
    // is going back to SENT, an active state that still holds its stock.
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

export interface DeleteEstimateResult {
  error: string | null;
  /** Parent deal id — clients use this to navigate after the row is gone. */
  dealId?: string;
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
 *
 * Returns `dealId` so the caller (estimate detail page) can navigate to the
 * parent deal — the estimate's own URL 404s the moment delete commits.
 */
export async function deleteEstimate(estimateId: string): Promise<DeleteEstimateResult> {
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
  return { error: null, dealId: est.dealId };
}

export async function declineEstimate(
  estimateId: string,
  reason: string,
): Promise<EstimateMutationResult> {
  const session = await requireRole(["ADMIN", "MANAGER"]);

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
  await db.$transaction(async (tx) => {
    await tx.estimate.update({
      where: { id: estimateId },
      data: { stage: "DECLINED", declinedAt: now, declineReason: trimmedReason },
    });
    // DRAFT/SENT held reservations — release them now that the estimate is dead.
    await releasePartLinesForEstimate(tx, estimateId, actorId(session));
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
/**
 * Set the tax rate (percent of post-discount subtotal) on a DRAFT estimate and
 * recompute its totals (cascades to the deal). Editable only while DRAFT —
 * matches the line editor's mutability rule.
 */
export async function setEstimateTaxRate(
  estimateId: string,
  rate: number,
): Promise<{ error: string | null }> {
  await requireRole(["ADMIN", "MANAGER"]);
  if (!Number.isInteger(rate) || rate < 0 || rate > 100) {
    return { error: "Ставка налога должна быть целым числом от 0 до 100%" };
  }
  const est = (await db.estimate.findUnique({
    where: { id: estimateId },
    select: { stage: true },
  })) as { stage: string } | null;
  if (!est) return { error: "Смета не найдена" };
  if (est.stage !== "DRAFT") return { error: "Налог можно менять только в черновике" };

  await db.estimate.update({ where: { id: estimateId }, data: { taxRate: rate } });
  await recomputeEstimateTotals(estimateId);
  return { error: null };
}

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
      taxRate: true,
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
        taxRate: number;
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
    const number = await nextEstimateNumber(tx);
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
        taxRate: parent.taxRate,
        total: parent.total,
        number,
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
    // Transfer holds: release the parent's (only if it still held them — SENT/
    // EXPIRED; DECLINED already released) and reserve the new DRAFT child's.
    if (parent.stage === "SENT" || parent.stage === "EXPIRED") {
      await releasePartLinesForEstimate(tx, parent.id, actorId(session));
    }
    await reservePartLinesForEstimate(tx, created.id, actorId(session));
    return created;
  });

  revalidatePath(`/admin/crm/deals/${parent.dealId}`);
  revalidatePath(`/admin/crm/estimates/${parent.id}`);
  return { error: null, estimateId: child.id };
}
