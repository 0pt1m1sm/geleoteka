import { createHmac, timingSafeEqual } from "node:crypto";

import {
  buildSyntheticMessageId,
  normalizeAddress,
  normalizeAddressList,
  normalizeMessageId,
  parseReferencesHeader,
  resolveOccurredAt,
  RESEND_SOURCE_FOLDER,
  type EmailAttachmentMeta,
  type EmailSource,
  type ParsedEmail,
} from "@/lib/email/types";

/**
 * Resend inbound (`email.received`) webhook envelope. The webhook does NOT
 * include the body or headers — those live behind a follow-up GET on
 * `/emails/receiving/{email_id}`.
 */
export interface ResendInboundEnvelope {
  type: "email.received";
  created_at: string;
  data: {
    email_id: string;
    created_at: string;
    from: string;
    to: string[];
    bcc: string[];
    cc: string[];
    message_id: string;
    subject: string;
    attachments: ResendInboundAttachment[];
  };
}

export interface ResendInboundAttachment {
  id: string;
  filename: string;
  content_type: string;
  content_disposition: string;
  content_id?: string;
}

export interface ResendInboundContent {
  html: string | null;
  text: string | null;
  headers: Array<{ name: string; value: string }>;
  attachments?: ResendInboundAttachment[];
}

/** Default recipient when no INBOUND_EMAIL setting is configured. */
export const DEFAULT_INBOUND_RECIPIENT = "info@geleoteka.ru";
const MAX_CLOCK_SKEW_SEC = 5 * 60;

interface VerifyInput {
  rawBody: string;
  headers: { svixId: string; svixTimestamp: string; svixSignature: string };
  secret: string;
  nowMs?: number;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Svix-style HMAC verification for Resend webhooks.
 *
 *   Algorithm:
 *     - signed = `${svix-id}.${svix-timestamp}.${rawBody}`
 *     - secretBytes = base64-decode(secret.stripPrefix("whsec_"))
 *     - expected = base64( HMAC-SHA256(secretBytes, signed) )
 *     - svix-signature has format `v1,sigA v1,sigB`; accept if ANY token matches
 *     - reject when |now - svix-timestamp*1000| > 5 min (replay window)
 *
 * Constant-time comparison on equal-length buffers; mismatched lengths return
 * false without throwing.
 */
export function verifyResendWebhook(input: VerifyInput): VerifyResult {
  const { rawBody, headers, secret } = input;
  const nowMs = input.nowMs ?? Date.now();

  if (!headers.svixId || !headers.svixTimestamp || !headers.svixSignature) {
    return { ok: false, reason: "missing svix headers" };
  }

  const tsSec = Number.parseInt(headers.svixTimestamp, 10);
  if (!Number.isFinite(tsSec)) return { ok: false, reason: "invalid svix-timestamp" };
  const skewSec = Math.abs(nowMs / 1000 - tsSec);
  if (skewSec > MAX_CLOCK_SKEW_SEC) {
    return { ok: false, reason: `timestamp skew ${Math.round(skewSec)}s > ${MAX_CLOCK_SKEW_SEC}s` };
  }

  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return { ok: false, reason: "invalid secret" };
  }
  if (secretBytes.length === 0) return { ok: false, reason: "empty secret" };

  const signed = `${headers.svixId}.${headers.svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signed).digest();

  // Multi-sig header: comma/space-separated tokens of form `vN,<base64sig>`.
  // Accept any that timing-safe-matches `expected`.
  const tokens = headers.svixSignature.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const [version, sigB64] = tok.split(",");
    if (version !== "v1" || !sigB64) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(sigB64, "base64");
    } catch {
      continue;
    }
    if (provided.length !== expected.length) continue;
    if (timingSafeEqual(provided, expected)) return { ok: true };
  }
  return { ok: false, reason: "no matching signature" };
}

/**
 * `to` may be `["info@geleoteka.ru"]` or `["Geleoteka <info@geleoteka.ru>"]`.
 * Case-insensitive substring match on the allowed local-part@domain string.
 */
export function shouldAcceptRecipient(
  toList: string[],
  allowedRecipient: string = DEFAULT_INBOUND_RECIPIENT,
): boolean {
  if (!toList || toList.length === 0) return false;
  const needle = allowedRecipient.toLowerCase();
  return toList.some((raw) => raw.toLowerCase().includes(needle));
}

/**
 * Resend's `from` field is either `"Display Name <addr@x>"` or `"addr@x"`.
 * Returns `{ email, name? }`; email is lower-cased.
 */
export function parseFromAddress(raw: string): { email: string; name?: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    return { email: match[2].trim().toLowerCase(), name: name.length > 0 ? name : undefined };
  }
  return { email: raw.trim().toLowerCase() };
}

/** Case-insensitive header lookup on the `[{ name, value }]` shape Resend returns. */
export function extractHeader(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string | null {
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === lower) return h.value;
  }
  return null;
}

/** Parse the `References` header into individual `<...>` ids. */
export function parseReferences(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(/\s+/).filter((s) => /^<[^>]+>$/.test(s));
}

/**
 * Map a verified Resend webhook onto the provider-neutral `ParsedEmail`.
 *
 * This is the boundary: above it everything is Resend-shaped, below it nothing
 * knows Resend exists. The Timeweb IMAP adapter will produce the same shape
 * from a raw MIME message, which is what lets one message arriving over both
 * transports collapse into a single CRM row.
 *
 * `mailbox` is the recipient we accepted the message for — the caller has it
 * from settings and it is what the source tuple is anchored to.
 */
export function resendEnvelopeToParsedEmail(input: {
  envelope: ResendInboundEnvelope;
  content: ResendInboundContent;
  mailbox?: string;
  now?: Date;
}): ParsedEmail {
  const { envelope, content } = input;
  const data = envelope.data;

  const source: EmailSource = {
    mailbox: (input.mailbox ?? DEFAULT_INBOUND_RECIPIENT).toLowerCase(),
    folder: RESEND_SOURCE_FOLDER,
    uidValidity: null,
    uid: null,
  };

  // The fetched headers are the authoritative copy; the envelope field is a
  // convenience mirror and is occasionally empty or unbracketed.
  const rfcMessageId =
    normalizeMessageId(extractHeader(content.headers, "Message-Id")) ??
    normalizeMessageId(data.message_id);

  const occurred = resolveOccurredAt({
    headerDate: extractHeader(content.headers, "Date"),
    internalDate: parseIsoDate(data.created_at),
    now: input.now,
  });

  const attachments = content.attachments ?? data.attachments ?? [];

  return {
    provider: "RESEND",
    // The receiving webhook fires only for mail addressed to us, so there is no
    // direction to infer here. Deciding direction from `MailIdentity` matters
    // for the IMAP archive, which also holds our own sent mail.
    direction: "INBOUND",
    from: normalizeAddress(data.from) ?? { email: data.from.trim().toLowerCase() },
    to: normalizeAddressList(data.to),
    cc: normalizeAddressList(data.cc),
    bcc: normalizeAddressList(data.bcc),
    subject: data.subject ?? "",
    bodyText: content.text,
    bodyHtml: content.html,
    // Every webhook shares one source tuple, so the Resend email id has to
    // discriminate — otherwise two id-less messages would hash to the same
    // synthetic id and the second would be dropped as a replay.
    rfcMessageId: rfcMessageId ?? buildSyntheticMessageId("RESEND", source, data.email_id),
    rfcMessageIdSynthetic: rfcMessageId === null,
    inReplyTo: normalizeMessageId(extractHeader(content.headers, "In-Reply-To")),
    references: parseReferencesHeader(extractHeader(content.headers, "References")),
    occurredAt: occurred.occurredAt,
    occurredAtEstimated: occurred.estimated,
    source,
    providerLocator: { kind: "resend", resendEmailId: data.email_id },
    attachments: attachments.map(toAttachmentMeta),
  };
}

function toAttachmentMeta(a: ResendInboundAttachment): EmailAttachmentMeta {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.content_type ?? null,
    contentDisposition: a.content_disposition ?? null,
    contentId: a.content_id ?? null,
  };
}

function parseIsoDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Fetch the full inbound email content from Resend. The webhook envelope
 * only carries metadata; HTML/text/headers/attachments come from this GET.
 */
export async function fetchResendEmailContent(
  emailId: string,
  apiKey: string,
): Promise<ResendInboundContent> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend GET /emails/receiving/${emailId} → ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    html: typeof data.html === "string" ? data.html : null,
    text: typeof data.text === "string" ? data.text : null,
    headers: Array.isArray(data.headers)
      ? (data.headers as Array<{ name: string; value: string }>)
      : [],
    attachments: Array.isArray(data.attachments)
      ? (data.attachments as ResendInboundAttachment[])
      : undefined,
  };
}
