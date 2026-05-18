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

interface AttemptFields {
  outcome: string;
  httpStatus: number;
  detail?: string;
  recipient?: string;
  fromEmail?: string;
  messageId?: string;
  hasSvixId?: boolean;
  hasSig?: boolean;
  hasTs?: boolean;
}

/**
 * Best-effort audit log so the admin can diagnose webhook problems via
 * /admin/settings/inbound-log without Railway log access. Failures here
 * are swallowed — diagnostic logging must never break the live route.
 */
async function logAttempt(fields: AttemptFields): Promise<void> {
  try {
    await db.inboundAttempt.create({
      data: {
        outcome: fields.outcome,
        httpStatus: fields.httpStatus,
        detail: fields.detail,
        recipient: fields.recipient,
        fromEmail: fields.fromEmail,
        messageId: fields.messageId,
        hasSvixId: fields.hasSvixId ?? false,
        hasSig: fields.hasSig ?? false,
        hasTs: fields.hasTs ?? false,
      },
    });
  } catch (err) {
    console.error("[INBOUND ATTEMPT LOG] failed to persist", err);
  }
}

/**
 * Public POST endpoint for Resend's `email.received` webhook.
 *
 *   Auth: HMAC-only (Svix-style svix-id/svix-timestamp/svix-signature). NO
 *   cookie / session / role guard — Resend can't carry one.
 *
 *   Every attempt — accepted or rejected — is logged to InboundAttempt for
 *   admin-side diagnostics. The log captures outcome, http status, the
 *   recipient/sender/message-id when known, and whether the svix headers
 *   were present at all (helps catch "request reached us but svix headers
 *   missing" cases).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const svixId = request.headers.get("svix-id") ?? "";
  const svixTs = request.headers.get("svix-timestamp") ?? "";
  const svixSig = request.headers.get("svix-signature") ?? "";
  const headerFlags = {
    hasSvixId: svixId.length > 0,
    hasSig: svixSig.length > 0,
    hasTs: svixTs.length > 0,
  };

  const secret = await getSetting("RESEND_WEBHOOK_SECRET");
  const apiKey = await getSetting("RESEND_API_KEY");

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[EMAIL INBOUND] CRITICAL: RESEND_WEBHOOK_SECRET unset");
      await logAttempt({
        outcome: "error_no_secret",
        httpStatus: 503,
        detail: "RESEND_WEBHOOK_SECRET не задан ни в админке, ни в env",
        ...headerFlags,
      });
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
    await logAttempt({
      outcome: "error_other",
      httpStatus: 400,
      detail: "request.text() threw",
      ...headerFlags,
    });
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (secret) {
    const v = verifyResendWebhook({
      rawBody: raw,
      headers: { svixId, svixTimestamp: svixTs, svixSignature: svixSig },
      secret,
    });
    if (!v.ok) {
      console.warn(`[EMAIL INBOUND] reject: ${v.reason}`);
      await logAttempt({
        outcome: "rejected_signature",
        httpStatus: 401,
        detail: v.reason,
        ...headerFlags,
      });
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let envelope: ResendInboundEnvelope;
  try {
    envelope = JSON.parse(raw) as ResendInboundEnvelope;
  } catch {
    await logAttempt({
      outcome: "error_other",
      httpStatus: 400,
      detail: "JSON.parse failed on raw body",
      ...headerFlags,
    });
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (envelope.type !== "email.received") {
    await logAttempt({
      outcome: "ignored_type",
      httpStatus: 200,
      detail: `envelope.type = ${envelope.type}`,
      ...headerFlags,
    });
    return NextResponse.json({ ignored: true, reason: "type" });
  }
  if (!envelope.data || typeof envelope.data.message_id !== "string" || !Array.isArray(envelope.data.to)) {
    await logAttempt({
      outcome: "error_other",
      httpStatus: 400,
      detail: "envelope.data shape invalid",
      ...headerFlags,
    });
    return NextResponse.json({ error: "malformed payload" }, { status: 400 });
  }

  // From here on we have message_id + to[]; persist them on every outcome.
  const messageId = envelope.data.message_id;
  const recipientRaw = envelope.data.to.join(", ");
  const fromEmail = envelope.data.from;

  const inboundEmail = (await getSetting("INBOUND_EMAIL")) ?? undefined;
  if (!shouldAcceptRecipient(envelope.data.to, inboundEmail)) {
    await logAttempt({
      outcome: "ignored_recipient",
      httpStatus: 200,
      detail: `INBOUND_EMAIL=${inboundEmail ?? "(default info@geleoteka.ru)"}; envelope.to=${recipientRaw}`,
      recipient: recipientRaw,
      fromEmail,
      messageId,
      ...headerFlags,
    });
    return NextResponse.json({ ignored: true, reason: "recipient" });
  }

  // Pre-check (opportunistic) — fast 200 for obvious retries.
  const [existingLog, existingInbox] = await Promise.all([
    db.communicationLog.findUnique({ where: { externalId: messageId }, select: { id: true } }),
    db.inboxMessage.findUnique({ where: { messageId }, select: { id: true } }),
  ]);
  if (existingLog || existingInbox) {
    await logAttempt({
      outcome: "duplicate",
      httpStatus: 200,
      detail: existingLog ? "matched CommunicationLog.externalId" : "matched InboxMessage.messageId",
      recipient: recipientRaw,
      fromEmail,
      messageId,
      ...headerFlags,
    });
    return NextResponse.json({ duplicate: true });
  }

  if (!apiKey) {
    console.error("[EMAIL INBOUND] RESEND_API_KEY unset — cannot fetch body");
    await logAttempt({
      outcome: "error_no_api_key",
      httpStatus: 503,
      detail: "RESEND_API_KEY не задан ни в админке, ни в env",
      recipient: recipientRaw,
      fromEmail,
      messageId,
      ...headerFlags,
    });
    return NextResponse.json({ error: "RESEND_API_KEY unset" }, { status: 503 });
  }

  let content;
  try {
    content = await fetchResendEmailContent(envelope.data.email_id, apiKey);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[EMAIL INBOUND] fetchResendEmailContent failed", err);
    await logAttempt({
      outcome: "error_upstream",
      httpStatus: 502,
      detail: errMsg.slice(0, 500),
      recipient: recipientRaw,
      fromEmail,
      messageId,
      ...headerFlags,
    });
    return NextResponse.json({ error: "upstream content fetch failed" }, { status: 502 });
  }

  try {
    const result = await resolveInboundEmail({ envelope, content });
    await logAttempt({
      outcome: `accepted_${result.kind}`,
      httpStatus: 200,
      detail: `id=${result.id}`,
      recipient: recipientRaw,
      fromEmail,
      messageId,
      ...headerFlags,
    });
    return NextResponse.json({ ok: true, kind: result.kind, id: result.id });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002") {
      await logAttempt({
        outcome: "duplicate",
        httpStatus: 200,
        detail: "P2002 in resolveInboundEmail (concurrent retry)",
        recipient: recipientRaw,
        fromEmail,
        messageId,
        ...headerFlags,
      });
      return NextResponse.json({ duplicate: true });
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[EMAIL INBOUND] resolveInboundEmail threw", err);
    await logAttempt({
      outcome: "error_other",
      httpStatus: 500,
      detail: errMsg.slice(0, 500),
      recipient: recipientRaw,
      fromEmail,
      messageId,
      ...headerFlags,
    });
    return NextResponse.json({ error: "resolution failed" }, { status: 500 });
  }
}
