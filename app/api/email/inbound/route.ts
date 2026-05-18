import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyResendWebhook,
  shouldAcceptRecipient,
  fetchResendEmailContent,
  type ResendInboundEnvelope,
} from "@/lib/email/inbound";
import { resolveInboundEmail } from "@/lib/email/resolve";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Public POST endpoint for Resend's `email.received` webhook.
 *
 *   Auth: HMAC-only (Svix-style svix-id/svix-timestamp/svix-signature). NO
 *   cookie / session / role guard — Resend can't carry one.
 *
 *   Idempotency: pre-check `externalId` against both CommunicationLog and
 *   InboxMessage; the DB unique constraints catch the race window via
 *   try/catch on P2002.
 *
 *   Recipient filter: only `info@geleoteka.ru` is accepted; other addresses
 *   are 200 + `{ ignored: true }` so Resend stops retrying.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Read from Setting table first (admin can override at /admin/settings/integrations),
  // fall back to env var when no DB row exists.
  const secret = await getSetting("RESEND_WEBHOOK_SECRET");
  const apiKey = await getSetting("RESEND_API_KEY");

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[EMAIL INBOUND] CRITICAL: RESEND_WEBHOOK_SECRET unset");
      return NextResponse.json({ error: "not configured" }, { status: 503 });
    }
    console.warn(
      "[EMAIL INBOUND] RESEND_WEBHOOK_SECRET unset — dev mode, skipping verify",
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (secret) {
    const v = verifyResendWebhook({
      rawBody: raw,
      headers: {
        svixId: request.headers.get("svix-id") ?? "",
        svixTimestamp: request.headers.get("svix-timestamp") ?? "",
        svixSignature: request.headers.get("svix-signature") ?? "",
      },
      secret,
    });
    if (!v.ok) {
      console.warn(`[EMAIL INBOUND] reject: ${v.reason}`);
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let envelope: ResendInboundEnvelope;
  try {
    envelope = JSON.parse(raw) as ResendInboundEnvelope;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (envelope.type !== "email.received") {
    return NextResponse.json({ ignored: true, reason: "type" });
  }
  if (!envelope.data || typeof envelope.data.message_id !== "string" || !Array.isArray(envelope.data.to)) {
    return NextResponse.json({ error: "malformed payload" }, { status: 400 });
  }
  const inboundEmail = (await getSetting("INBOUND_EMAIL")) ?? undefined;
  if (!shouldAcceptRecipient(envelope.data.to, inboundEmail)) {
    return NextResponse.json({ ignored: true, reason: "recipient" });
  }

  const messageId = envelope.data.message_id;

  // Pre-check (opportunistic) — fast 200 for obvious retries. The DB
  // unique constraint is the actual guarantee against concurrent races
  // (caught below via P2002).
  const [existingLog, existingInbox] = await Promise.all([
    db.communicationLog.findUnique({ where: { externalId: messageId }, select: { id: true } }),
    db.inboxMessage.findUnique({ where: { messageId }, select: { id: true } }),
  ]);
  if (existingLog || existingInbox) {
    return NextResponse.json({ duplicate: true });
  }

  if (!apiKey) {
    console.error("[EMAIL INBOUND] RESEND_API_KEY unset — cannot fetch body");
    return NextResponse.json({ error: "RESEND_API_KEY unset" }, { status: 503 });
  }

  let content;
  try {
    content = await fetchResendEmailContent(envelope.data.email_id, apiKey);
  } catch (err) {
    console.error("[EMAIL INBOUND] fetchResendEmailContent failed", err);
    return NextResponse.json({ error: "upstream content fetch failed" }, { status: 502 });
  }

  try {
    const result = await resolveInboundEmail({ envelope, content });
    return NextResponse.json({ ok: true, kind: result.kind, id: result.id });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002") {
      // Concurrent delivery raced past the pre-check. The other request won
      // and persisted; treat as duplicate.
      return NextResponse.json({ duplicate: true });
    }
    console.error("[EMAIL INBOUND] resolveInboundEmail threw", err);
    return NextResponse.json({ error: "resolution failed" }, { status: 500 });
  }
}
