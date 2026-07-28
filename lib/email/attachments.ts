import { simpleParser, type ParsedMail } from "mailparser";

import type { ImapPort } from "@/lib/email/sync";
import type { ProviderLocator } from "@/lib/email/types";

/**
 * Provider-neutral attachment retrieval.
 *
 * The one rule this file exists to enforce: the browser addresses an attachment
 * by our INTERNAL `EmailMessage.id` plus the attachment id, and NOTHING else. The
 * mailbox, folder, provider UID and — above all — the mailbox password are read
 * from the stored `providerLocator`, never from the request. A caller therefore
 * cannot turn this into an open proxy for arbitrary mailboxes or Resend emails.
 *
 * `resolveAttachment` is pure w.r.t. IO: it takes the DB slice, an `ImapPort`
 * (the same read-only BODY.PEEK port the sync worker uses — we never open a
 * second IMAP client) and a Resend fetcher as injected deps, so every branch —
 * unknown parent, wrong attachment, vanished message, expired Resend object,
 * hostile filename — is exercised against fakes without a socket. The thin route
 * handler adds only auth and turns the outcome into a `Response`.
 */

/** The `EmailMessage` fields the attachment path reads. Cast, per conventions. */
export interface AttachmentDbPort {
  emailMessage: {
    findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  };
}

/**
 * Fetch one attachment's bytes from Resend's receiving API. Injected so the
 * route can wire the real API key while tests pass a fake. The `resendEmailId`
 * comes from the stored locator, not the request.
 */
export type ResendAttachmentFetcher = (
  resendEmailId: string,
  attachmentId: string,
) => Promise<ResendFetchResult>;

export type ResendFetchResult =
  | { ok: true; content: Buffer; contentType: string | null }
  | { ok: false; status: 410 | 502 | 503; reason: string };

export interface AttachmentDeps {
  db: AttachmentDbPort;
  /**
   * Built lazily and only when the locator is IMAP — a Resend-locator request
   * must not require IMAP configuration to exist.
   */
  getImapPort: () => ImapPort | Promise<ImapPort>;
  resend: ResendAttachmentFetcher;
}

export type AttachmentOutcome =
  | { ok: true; content: Buffer; filename: string; contentType: string }
  | { ok: false; status: 404 | 410 | 502 | 503; reason: string };

interface StoredAttachmentMeta {
  id: string;
  filename: string;
  contentType: string | null;
}

const OCTET_STREAM = "application/octet-stream";

/**
 * Resolve an attachment by internal message id + attachment id.
 *
 * Ownership is proven twice over: the message must exist, and the attachment id
 * must appear in that message's stored metadata. The second check doubles as
 * input validation — the id is matched against a known allow-list rather than
 * trusted, so it can never be smuggled onward into a provider request.
 */
export async function resolveAttachment(
  emailMessageId: string,
  attachmentId: string,
  deps: AttachmentDeps,
): Promise<AttachmentOutcome> {
  const row = (await deps.db.emailMessage.findUnique({
    where: { id: emailMessageId },
    select: {
      providerLocator: true,
      attachments: true,
      uid: true,
      uidValidity: true,
    },
  })) as
    | {
        providerLocator: ProviderLocator | null;
        attachments: unknown;
        uid: bigint | null;
        uidValidity: bigint | null;
      }
    | null;

  // Unknown parent — indistinguishable, to the caller, from an attachment on
  // someone else's message. Both are a plain 404; we leak nothing either way.
  if (!row) return { ok: false, status: 404, reason: "message not found" };

  const meta = findAttachmentMeta(row.attachments, attachmentId);
  if (!meta) return { ok: false, status: 404, reason: "attachment not found" };

  const locator = row.providerLocator;
  if (!locator || typeof locator !== "object") {
    // The row carries no way to reach the bytes — a dead-letter row, or content
    // already purged. Explicit 410 rather than a 500 or a silent empty body.
    return { ok: false, status: 410, reason: "attachment source unavailable" };
  }

  if (locator.kind === "resend") {
    const res = await deps.resend(locator.resendEmailId, attachmentId);
    if (!res.ok) return res;
    return {
      ok: true,
      content: res.content,
      filename: sanitizeAttachmentFilename(meta.filename),
      contentType: meta.contentType ?? res.contentType ?? OCTET_STREAM,
    };
  }

  if (locator.kind === "imap") {
    return resolveImapAttachment(locator, attachmentId, meta, deps);
  }

  return { ok: false, status: 410, reason: "unknown attachment source" };
}

async function resolveImapAttachment(
  locator: Extract<ProviderLocator, { kind: "imap" }>,
  attachmentId: string,
  meta: StoredAttachmentMeta,
  deps: AttachmentDeps,
): Promise<AttachmentOutcome> {
  const uid = parseBigInt(locator.uid);
  if (uid === null) return { ok: false, status: 410, reason: "message no longer addressable" };

  const port = await deps.getImapPort();
  const handle = await port.open(locator.mailbox, locator.folder);
  try {
    const raw = await handle.fetchRaw(uid);
    // Manager deleted/moved the message, or the archive expunged it — the copy
    // we point at is gone. 410, not 500: it existed and no longer does.
    if (!raw) return { ok: false, status: 410, reason: "message no longer in mailbox" };

    const parsed: ParsedMail = await simpleParser(raw.source, { skipImageLinks: true });
    const part = findMimeAttachment(parsed, attachmentId);
    if (!part) return { ok: false, status: 410, reason: "attachment no longer present" };

    const content = Buffer.isBuffer(part.content)
      ? part.content
      : Buffer.from(part.content as Uint8Array);
    return {
      ok: true,
      content,
      filename: sanitizeAttachmentFilename(meta.filename),
      contentType: meta.contentType ?? part.contentType ?? OCTET_STREAM,
    };
  } finally {
    try {
      await handle.close();
    } catch {
      /* best effort — the socket closes on its own if this throws */
    }
  }
}

/** Locate the stored metadata for an attachment id; null when it is not listed. */
function findAttachmentMeta(attachments: unknown, attachmentId: string): StoredAttachmentMeta | null {
  if (!Array.isArray(attachments)) return null;
  for (const entry of attachments) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id !== attachmentId) continue;
    return {
      id: e.id,
      filename: typeof e.filename === "string" && e.filename.length > 0 ? e.filename : "attachment",
      contentType: typeof e.contentType === "string" ? e.contentType : null,
    };
  }
  return null;
}

/**
 * Find a MIME attachment matching `attachmentId`, deriving each part's id EXACTLY
 * as the IMAP mapper did at ingest time (`partId → contentId → positional`), so
 * the id the UI holds still resolves the same part on re-parse.
 */
function findMimeAttachment(
  parsed: ParsedMail,
  attachmentId: string,
): ParsedMail["attachments"][number] | null {
  const list = parsed.attachments ?? [];
  for (let i = 0; i < list.length; i += 1) {
    const att = list[i];
    const cid = cleanContentId(att.contentId ?? att.cid ?? null);
    const id = att.partId ?? cid ?? `att-${i + 1}`;
    if (id === attachmentId) return att;
  }
  return null;
}

function cleanContentId(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^<|>$/g, "");
  return trimmed.length > 0 ? trimmed : null;
}

function parseBigInt(raw: string | null): bigint | null {
  if (raw === null) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

/**
 * Reduce an attachment filename to something safe to name a download.
 *
 *   - Strip everything up to the last path separator, then reject `.`/`..` —
 *     defeats path traversal (`../../etc/passwd`).
 *   - Remove CR, LF and other control characters — a header-injection guard, so
 *     a crafted filename cannot inject a second response header.
 *   - Collapse remaining whitespace and cap the length.
 *
 * Never returns an empty string; falls back to `attachment`.
 */
export function sanitizeAttachmentFilename(raw: string | null | undefined): string {
  if (!raw) return "attachment";
  // Take the basename: drop any directory portion regardless of slash style.
  const base = raw.split(/[\\/]/).pop() ?? "";
  // Remove control characters (incl. CR/LF/NUL) that could break out of the header.
  const stripped = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (stripped.length === 0 || stripped === "." || stripped === "..") return "attachment";
  return stripped.slice(0, 255);
}

/**
 * Build a `Content-Disposition: attachment` header for a (pre-sanitized) name.
 *
 * Always emits both a plain ASCII `filename` fallback and an RFC 5987
 * `filename*` for the full UTF-8 name. The ASCII fallback additionally drops
 * quotes and backslashes so it cannot terminate its own quoted-string, and the
 * `filename*` value is percent-encoded, so neither can carry a raw `"`, `;`,
 * CR or LF into the header.
 */
export function buildContentDisposition(filename: string): string {
  const safe = sanitizeAttachmentFilename(filename);
  const ascii = safe.replace(/["\\]/g, "_").replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeRFC5987(safe);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** RFC 5987 value encoding — percent-escape everything outside the attr-char set. */
function encodeRFC5987(value: string): string {
  // encodeURIComponent leaves `' ( ) *` raw, but they are not RFC 5987 attr-chars;
  // percent-escape them too. Over-encoding otherwise-legal chars is harmless.
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Turn a resolved outcome into an HTTP `Response`; the route's only glue. */
export function attachmentOutcomeToResponse(outcome: AttachmentOutcome): Response {
  if (!outcome.ok) {
    return new Response(JSON.stringify({ error: outcome.reason }), {
      status: outcome.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(new Uint8Array(outcome.content), {
    status: 200,
    headers: {
      "Content-Type": outcome.contentType || OCTET_STREAM,
      // Always a download, never inline — a hostile HTML/SVG attachment must not
      // execute in our origin.
      "Content-Disposition": buildContentDisposition(outcome.filename),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
