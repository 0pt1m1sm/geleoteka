import { randomBytes } from "node:crypto";

import { tenantDb } from "@/lib/tenant/scoped-db";
import { TRANSPORT_UNKNOWN_PREFIX } from "@/lib/email/transport";

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
  const db = await tenantDb();
  try {
    const row = (await db.communicationLog.create({
      data: {
        customerUserId: input.customerUserId,
        dealId: input.dealId ?? null,
        authorUserId: input.authorUserId ?? null,
        channel: "EMAIL_OUTBOUND",
        // Initial state: N_A ("unconfirmed until the transport answers"). The
        // pipeline flips to ACCEPTED once a transport takes custody (HTTP 200 /
        // SMTP 250) or FAILED on a definite rejection. On an ambiguous timeout
        // it stays close to this unconfirmed state (see markOutboundEmailFailed).
        // This closes the window where process death between persist-write and
        // send-confirmation would leave a row falsely claiming acceptance.
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
 * Flip a previously-persisted outbound row to ACCEPTED once a transport took
 * custody (Resend HTTP 200 / SMTP 250). Called from each outbound call site in
 * the `.then(success)` branch — never before the transport answers.
 *
 * ACCEPTED is deliberately NOT "delivered": it means a provider accepted the
 * message for delivery, which only a DSN/provider event can upgrade to actual
 * inbox delivery. Rows written before this migration keep their legacy
 * `DELIVERED` value and stay valid.
 */
export async function markOutboundEmailSent(messageId: string): Promise<void> {
  const db = await tenantDb();
  try {
    await db.communicationLog.updateMany({
      where: { externalId: messageId, channel: "EMAIL_OUTBOUND" },
      data: { outcome: "ACCEPTED" },
    });
  } catch (err) {
    console.error("[EMAIL LOG] markOutboundEmailSent", err);
  }
}

/**
 * Record a non-success outbound outcome. Two cases, distinguished by whether the
 * error carries the transport's `TRANSPORT_UNKNOWN_PREFIX`:
 *
 *   - DEFINITE reject (server said no) → `FAILED`. Nothing was delivered.
 *   - AMBIGUOUS timeout after the payload may have been handed off → leave the
 *     row in `N_A` (unconfirmed). Marking it FAILED would be a lie that invites
 *     a manual resend of a message that might already have gone out; there is no
 *     UNKNOWN enum value and no migration in this task, and N_A already means
 *     "not confirmed". Either way the reason is appended to the body so the
 *     manager sees it on the timeline.
 *
 * Called from each outbound call site's `.then(!success)` branch, so the binary
 * call-site contract is unchanged — the nuance is decided here from the error.
 */
export async function markOutboundEmailFailed(
  messageId: string,
  error: string,
): Promise<void> {
  const db = await tenantDb();
  try {
    const existing = (await db.communicationLog.findUnique({
      where: { externalId: messageId },
      select: { id: true, body: true },
    })) as { id: string; body: string | null } | null;
    if (!existing) return;

    const isUnknown = error.startsWith(TRANSPORT_UNKNOWN_PREFIX);
    const note = isUnknown ? `[UNKNOWN: ${error}]` : `[FAILED: ${error}]`;
    await db.communicationLog.update({
      where: { id: existing.id },
      data: {
        // Unknown stays unconfirmed (N_A); a definite reject becomes FAILED.
        outcome: isUnknown ? "N_A" : "FAILED",
        body: `${existing.body ?? ""}\n\n${note}`.trim(),
      },
    });
  } catch (err) {
    console.error("[EMAIL LOG] markOutboundEmailFailed", err);
  }
}
