import { createHash } from "node:crypto";

/**
 * Provider-neutral email domain types.
 *
 * Every transport (the Resend `email.received` webhook today, the Timeweb IMAP
 * worker next) maps its own payload onto `ParsedEmail`. Nothing below this line
 * — resolution, ingest, the CRM — is allowed to know which provider a message
 * came from, with the single exception of `providerLocator`, which is opaque
 * here and only opened again when attachment bytes are fetched.
 */

export type EmailProviderName = "RESEND" | "TIMEWEB_IMAP";
export type EmailDirectionName = "INBOUND" | "OUTBOUND";

export interface EmailAddress {
  /** Lower-cased, angle brackets stripped. */
  email: string;
  name?: string;
}

export interface EmailAttachmentMeta {
  id: string;
  filename: string;
  contentType: string | null;
  contentDisposition: string | null;
  contentId?: string | null;
  size?: number | null;
}

/** Where a copy of the message was read from. */
export interface EmailSource {
  /** The mailbox we polled, or the accepted recipient for webhook deliveries. */
  mailbox: string;
  folder: string;
  uidValidity: bigint | null;
  uid: bigint | null;
}

/**
 * Coordinates for fetching attachment bytes later. Persisted as JSON, so UIDs
 * are carried as strings — `bigint` has no JSON representation. Never holds
 * credentials; the mailbox password lives only in secret env.
 */
export type ProviderLocator =
  | { kind: "resend"; resendEmailId: string }
  | {
      kind: "imap";
      mailbox: string;
      folder: string;
      uidValidity: string | null;
      uid: string | null;
    };

export interface ParsedEmail {
  provider: EmailProviderName;
  direction: EmailDirectionName;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  /** Normalized RFC 5322 Message-Id, or a synthetic one — never empty. */
  rfcMessageId: string;
  rfcMessageIdSynthetic: boolean;
  inReplyTo: string | null;
  /** RFC order: oldest ancestor first. */
  references: string[];
  occurredAt: Date;
  occurredAtEstimated: boolean;
  source: EmailSource;
  providerLocator: ProviderLocator | null;
  attachments: EmailAttachmentMeta[];
}

/** Folder marker for webhook deliveries, which have no real IMAP folder. */
export const RESEND_SOURCE_FOLDER = "RESEND_WEBHOOK";

const MESSAGE_ID_TOKEN = /<([^<>]+)>/g;
/** A bare id we are willing to wrap: `local@domain`, no spaces or brackets. */
const BARE_MESSAGE_ID = /^[^<>@\s]+@[^<>@\s]+$/;

/**
 * Pull a usable Message-Id out of a raw header value.
 *
 * Real-world headers are messier than the RFC: values arrive folded, duplicated
 * into one string by a forwarding MTA, comma-joined, or bare without brackets.
 * We take the FIRST bracketed token — for a duplicated header that is the
 * original id, which is what the sending side will echo in `In-Reply-To`.
 *
 * Returns null when there is nothing to thread on; callers must then fall back
 * to `buildSyntheticMessageId` rather than inventing a random id.
 */
export function normalizeMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  MESSAGE_ID_TOKEN.lastIndex = 0;
  const match = MESSAGE_ID_TOKEN.exec(trimmed);
  if (match) {
    const inner = match[1].trim();
    return inner.length > 0 ? `<${inner}>` : null;
  }

  return BARE_MESSAGE_ID.test(trimmed) ? `<${trimmed}>` : null;
}

/**
 * Parse a `References` header into individual ids, oldest first, de-duplicated.
 * Tolerates comma separators and folded whitespace, both of which appear in
 * practice and which a strict whitespace split silently drops.
 */
export function parseReferencesHeader(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  MESSAGE_ID_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MESSAGE_ID_TOKEN.exec(raw)) !== null) {
    const inner = match[1].trim();
    if (inner.length === 0) continue;
    const id = `<${inner}>`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Normalize `"Display Name" <Addr@Example>` / `<addr@x>` / `addr@x` into a
 * lower-cased address plus optional display name. Returns null when the value
 * holds no address at all, so callers can decide rather than store garbage.
 */
export function normalizeAddress(raw: string | null | undefined): EmailAddress | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const angled = trimmed.match(/^(.*?)<([^<>]+)>\s*$/);
  if (angled) {
    const email = angled[2].trim().toLowerCase();
    if (!email.includes("@")) return null;
    const name = angled[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return name.length > 0 ? { email, name } : { email };
  }

  const bare = trimmed.toLowerCase();
  return bare.includes("@") ? { email: bare } : null;
}

/** Normalize a list of raw address strings, dropping the unparseable ones. */
export function normalizeAddressList(
  raw: ReadonlyArray<string> | null | undefined,
): EmailAddress[] {
  if (!raw) return [];
  const out: EmailAddress[] = [];
  for (const entry of raw) {
    const parsed = normalizeAddress(entry);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Deterministic stand-in for a missing or unusable Message-Id.
 *
 * Derived purely from `provider + mailbox + folder + uidValidity + uid`, so
 * re-reading the same UID after a restart produces the SAME id and dedupes
 * against the row already stored. A random UUID would import the message again
 * on every replay, which is the failure this exists to prevent.
 *
 * `discriminator` is for sources whose tuple is not per-message unique. Every
 * Resend webhook shares one tuple — there is no UID — so without the Resend
 * email id here, two id-less webhook messages would hash alike and the second
 * would be discarded as a replay of the first. IMAP needs no discriminator:
 * `(uidValidity, uid)` already identifies the message within its mailbox.
 *
 * Components are length-prefixed before hashing so a separator character inside
 * a mailbox or folder name cannot make two different tuples hash alike.
 */
export function buildSyntheticMessageId(
  provider: EmailProviderName,
  source: EmailSource,
  discriminator?: string | null,
): string {
  const parts = [
    provider,
    source.mailbox.toLowerCase(),
    source.folder,
    source.uidValidity === null ? "" : source.uidValidity.toString(),
    source.uid === null ? "" : source.uid.toString(),
    discriminator ?? "",
  ];
  const canonical = parts.map((p) => `${p.length}:${p}`).join("");
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 40);
  return `<sync-${digest}@synthetic.geleoteka.ru>`;
}

/** Guards against a Date header that parsed but is obviously not a send time. */
const MIN_PLAUSIBLE_MS = Date.UTC(1990, 0, 1);
const MAX_SKEW_AHEAD_MS = 48 * 60 * 60 * 1000;

/** Parse an RFC 5322 `Date` header. Returns null when absent or implausible. */
export function parseDateHeader(
  raw: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw.trim());
  const ms = parsed.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms < MIN_PLAUSIBLE_MS) return null;
  if (ms > now.getTime() + MAX_SKEW_AHEAD_MS) return null;
  return parsed;
}

export interface OccurredAtResult {
  occurredAt: Date;
  /** True when we had to substitute the sync time — the CRM timeline is a guess. */
  estimated: boolean;
}

/**
 * Decide when a message actually happened: `Date` header first, IMAP
 * INTERNALDATE second, sync time only as a flagged last resort.
 *
 * The flag matters. After an outage the worker imports days of backlog at once;
 * silently stamping all of it with the sync time would collapse the CRM
 * timeline and make every SLA measurement wrong.
 */
export function resolveOccurredAt(input: {
  headerDate: string | Date | null | undefined;
  internalDate: Date | null | undefined;
  now?: Date;
}): OccurredAtResult {
  const now = input.now ?? new Date();

  const fromHeader =
    input.headerDate instanceof Date
      ? parseDateHeader(input.headerDate.toISOString(), now)
      : parseDateHeader(input.headerDate, now);
  if (fromHeader) return { occurredAt: fromHeader, estimated: false };

  if (input.internalDate && !Number.isNaN(input.internalDate.getTime())) {
    return { occurredAt: input.internalDate, estimated: false };
  }

  return { occurredAt: now, estimated: true };
}
