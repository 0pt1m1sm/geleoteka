import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  attachmentOutcomeToResponse,
  resolveAttachment,
  type AttachmentDbPort,
  type AttachmentDeps,
  type ResendFetchResult,
} from "@/lib/email/attachments";
import type { ImapPort } from "@/lib/email/sync";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Provider-neutral attachment download, addressed by our internal
 * `EmailMessage.id` + attachment id:
 *
 *   GET /api/admin/email-messages/<emailMessageId>/attachments/<attachmentId>
 *
 * The browser never supplies a mailbox, folder, provider UID or password. Those
 * are read from the row's stored `providerLocator` inside `resolveAttachment`,
 * which also proves the attachment belongs to the parent and dispatches to the
 * right provider (legacy Resend proxy vs. read-only IMAP BODY.PEEK). This handler
 * adds exactly two things: the ADMIN/MANAGER gate and turning the outcome into a
 * download response. Legacy rows that only have a `resendEmailId` (no
 * `EmailMessage`) keep using `/api/admin/inbox/attachments/[id]` — the UI picks
 * the route by whether the row carries an `emailMessageId`.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ messageId: string; attachmentId: string }> },
): Promise<Response> {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId, attachmentId } = await context.params;

  try {
    const outcome = await resolveAttachment(messageId, attachmentId, buildAttachmentDeps());
    return attachmentOutcomeToResponse(outcome);
  } catch (err) {
    // An unexpected failure reaching the provider (IMAP auth/connection dropped,
    // Resend network error). Never surface the details — a clean 502, logged
    // server-side only.
    console.error("[ATTACHMENT] resolve failed", err);
    return NextResponse.json({ error: "attachment fetch failed" }, { status: 502 });
  }
}

/** Wire the real DB, a lazily-built IMAP port and the Resend proxy fetcher. */
function buildAttachmentDeps(): AttachmentDeps {
  return {
    db: db as unknown as AttachmentDbPort,
    // Only constructed when the locator is actually IMAP — a Resend download must
    // not require IMAP configuration. Imported lazily to keep imapflow out of the
    // common path.
    getImapPort: async (): Promise<ImapPort> => {
      const { buildImapPortFromSettings } = await import("@/lib/email/mail-sync-config");
      return buildImapPortFromSettings();
    },
    resend: fetchResendAttachment,
  };
}

/**
 * Pull one attachment from Resend's receiving API. The `resendEmailId` is the one
 * stored on the row, never a value from the request. Resend keeps attachments
 * ~30 days; a 404 upstream means the object expired → surface a clean 410.
 */
async function fetchResendAttachment(
  resendEmailId: string,
  attachmentId: string,
): Promise<ResendFetchResult> {
  const apiKey = await getSetting("RESEND_API_KEY");
  if (!apiKey) return { ok: false, status: 503, reason: "not configured" };

  const upstream = await fetch(
    `https://api.resend.com/emails/receiving/${resendEmailId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (upstream.status === 404) return { ok: false, status: 410, reason: "expired" };
  if (!upstream.ok) return { ok: false, status: 502, reason: "upstream error" };

  const content = Buffer.from(await upstream.arrayBuffer());
  return { ok: true, content, contentType: upstream.headers.get("Content-Type") };
}
