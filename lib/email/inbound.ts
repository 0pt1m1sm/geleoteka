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
 * Legacy Resend `email.received` envelope retained for offline fixtures. The
 * former webhook did not include the body or headers, so fixtures model the
 * separately fetched content too.
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

const DEFAULT_INBOUND_RECIPIENT = "sales@geleoteka.ru";

/** Case-insensitive header lookup on the `[{ name, value }]` shape Resend returns. */
function extractHeader(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string | null {
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === lower) return h.value;
  }
  return null;
}

/**
 * Map a legacy Resend envelope onto the provider-neutral `ParsedEmail`.
 *
 * The live Resend receiver is retired. This pure adapter remains for offline
 * verification fixtures that exercise shared ingestion and historical Resend
 * locators; it performs no network or database work.
 *
 * `mailbox` anchors the synthetic source tuple when a fixture needs a
 * non-default historical recipient.
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
    // The retired receiver handled only mail addressed to us, so legacy
    // envelopes are always inbound.
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
