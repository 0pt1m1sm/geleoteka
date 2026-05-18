import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";

/**
 * RFC 5322 Message-Id for outbound mail. Bracket-wrapped, locally rooted at
 * `@geleoteka.ru` so inbound replies' `In-Reply-To` headers match the exact
 * string stored in `CommunicationLog.externalId`.
 */
export function generateOutboundMessageId(): string {
  return `<${randomBytes(12).toString("hex")}@geleoteka.ru>`;
}

export interface RecordOutboundEmailInput {
  customerUserId: string;
  dealId?: string | null;
  authorUserId?: string | null;
  subject: string;
  body: string;
  messageId: string;
}

/**
 * Persist an outbound email as an `EMAIL_OUTBOUND` row in `CommunicationLog`
 * BEFORE the actual send hits Resend. This way a fast customer reply can
 * still match via `In-Reply-To = externalId` even when their MTA outraces
 * our post-send write. On unique-violation (duplicate retry) this no-ops
 * and returns null.
 */
export async function recordOutboundEmail(
  input: RecordOutboundEmailInput,
): Promise<string | null> {
  try {
    const row = (await db.communicationLog.create({
      data: {
        customerUserId: input.customerUserId,
        dealId: input.dealId ?? null,
        authorUserId: input.authorUserId ?? null,
        channel: "EMAIL_OUTBOUND",
        // Initial state: N_A ("undelivered until Resend confirms"). The
        // pipeline flips to DELIVERED on success or FAILED on error. This
        // closes the window where process death between persist-write and
        // send-confirmation would leave a row claiming DELIVERED.
        outcome: "N_A",
        subject: input.subject,
        externalId: input.messageId,
        body: input.body,
      },
      select: { id: true },
    })) as { id: string };
    return row.id;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002") return null;
    console.error("[EMAIL LOG] recordOutboundEmail failed", err);
    return null;
  }
}

/**
 * Flip a previously-persisted outbound row to DELIVERED after the Resend
 * send returned a 200. Called from each outbound call site in the
 * `.then(success)` branch — never before send confirmation.
 */
export async function markOutboundEmailSent(messageId: string): Promise<void> {
  try {
    await db.communicationLog.updateMany({
      where: { externalId: messageId, channel: "EMAIL_OUTBOUND" },
      data: { outcome: "DELIVERED" },
    });
  } catch (err) {
    console.error("[EMAIL LOG] markOutboundEmailSent", err);
  }
}

/**
 * Flip an optimistically-persisted outbound row to FAILED when the Resend
 * send errors out. The error string is appended to body so the manager can
 * see what went wrong on the timeline.
 */
export async function markOutboundEmailFailed(
  messageId: string,
  error: string,
): Promise<void> {
  try {
    const existing = (await db.communicationLog.findUnique({
      where: { externalId: messageId },
      select: { id: true, body: true },
    })) as { id: string; body: string | null } | null;
    if (!existing) return;
    await db.communicationLog.update({
      where: { id: existing.id },
      data: {
        outcome: "FAILED",
        body: `${existing.body ?? ""}\n\n[FAILED: ${error}]`.trim(),
      },
    });
  } catch (err) {
    console.error("[EMAIL LOG] markOutboundEmailFailed", err);
  }
}
