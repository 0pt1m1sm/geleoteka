import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import { db } from "@/lib/db";
import type { ImapPort, ImapSourceHandle, MailboxRoleName, MimeMapper } from "@/lib/email/sync";
import {
  buildSyntheticMessageId,
  normalizeAddress,
  normalizeAddressList,
  normalizeMessageId,
  parseReferencesHeader,
  resolveOccurredAt,
  type EmailAddress,
  type EmailAttachmentMeta,
  type EmailDirectionName,
  type EmailSource,
  type ParsedEmail,
} from "@/lib/email/types";

/**
 * Timeweb IMAP adapter: the thin, provider-specific edge of the mail sync.
 *
 * Two responsibilities, both provider-specific and therefore quarantined here:
 *
 *   - `createTimewebImapPort` — an `ImapPort` backed by imapflow. It only ever
 *     opens mailboxes read-only and reads message source with BODY.PEEK, so a
 *     manager's INBOX is never marked \Seen and nothing is moved or deleted.
 *   - `mapMimeToParsedEmail` — turns a raw MIME message into the same
 *     `ParsedEmail` the Resend webhook produces, reusing the shared
 *     normalization helpers so both transports agree byte-for-byte on the
 *     threading keys that make cross-provider dedupe work.
 *
 * Direction is decided from the normalized From against the `MailIdentity`
 * registry, never from which folder the message sits in — the outgoing-control
 * archive holds our own sent mail in its INBOX.
 */

/** Cap on the message bytes we pull over the wire; guards worker memory. */
const DEFAULT_MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
/** Cap on stored body length; a hostile message will not bloat a row. */
const DEFAULT_MAX_BODY_CHARS = 200_000;
/** Cap handed to mailparser's HTML parser. */
const MAX_HTML_LENGTH = 2 * 1024 * 1024;

export interface ImapCredential {
  user: string;
  pass: string;
}

export interface TimewebImapConfig {
  host: string;
  port: number;
  /** Resolves per-mailbox credentials from secret env. Never logged. */
  credential: (mailbox: string) => ImapCredential | null;
  maxMessageBytes?: number;
  connectionTimeoutMs?: number;
}

/**
 * Resolve IMAP credentials for a mailbox from environment only.
 *
 * The login for Timeweb is always the full address, so `user` is the mailbox
 * itself. The password is looked up per-mailbox — `TIMEWEB_IMAP_PASSWORD_<SLUG>`
 * where SLUG upper-cases the address and replaces every non-alphanumeric run
 * with `_` — falling back to the single-mailbox pair `TIMEWEB_IMAP_USER` /
 * `TIMEWEB_IMAP_PASSWORD` when that matches. Passwords never touch the Setting
 * table or the client bundle.
 */
export function resolveImapCredential(
  mailbox: string,
  env: NodeJS.ProcessEnv = process.env,
): ImapCredential | null {
  const norm = mailbox.trim().toLowerCase();
  if (!norm.includes("@")) return null;

  const slug = norm.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  const perMailbox = env[`TIMEWEB_IMAP_PASSWORD_${slug}`];
  if (perMailbox && perMailbox.trim().length > 0) {
    return { user: norm, pass: perMailbox };
  }

  const defUser = (env.TIMEWEB_IMAP_USER ?? "").trim().toLowerCase();
  const defPass = env.TIMEWEB_IMAP_PASSWORD ?? "";
  if (defUser && defPass.length > 0 && defUser === norm) {
    return { user: norm, pass: defPass };
  }
  return null;
}

/** Build the real IMAP port. Kept out of the sync core so that stays testable. */
export function createTimewebImapPort(config: TimewebImapConfig): ImapPort {
  const maxLen = config.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;

  return {
    async open(mailbox: string, folder: string): Promise<ImapSourceHandle> {
      const cred = config.credential(mailbox);
      if (!cred) {
        throw new Error(`No IMAP credential configured for mailbox ${mailbox}`);
      }

      const client = new ImapFlow({
        host: config.host,
        port: config.port,
        // IMAPS only — plaintext 143 is forbidden by the migration plan.
        secure: true,
        auth: { user: cred.user, pass: cred.pass },
        logger: false,
        // Verify the server certificate; do not accept a downgrade.
        tls: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: config.host },
        connectionTimeout: config.connectionTimeoutMs ?? 30_000,
      });

      await client.connect();

      let lock;
      try {
        lock = await client.getMailboxLock(folder, { readOnly: true });
      } catch (err) {
        try {
          await client.logout();
        } catch {
          client.close();
        }
        throw err;
      }

      const box = client.mailbox;
      if (!box) {
        lock.release();
        try {
          await client.logout();
        } catch {
          client.close();
        }
        throw new Error(`Failed to open mailbox ${mailbox}/${folder}`);
      }
      const uidValidity = box.uidValidity;

      return {
        uidValidity,

        async highestUid(): Promise<bigint | null> {
          const cur = client.mailbox;
          if (!cur || cur.exists === 0) return null;
          // "*" addresses the highest message by sequence; its UID is the max.
          const one = await client.fetchOne("*", { uid: true });
          return one && typeof one.uid === "number" ? BigInt(one.uid) : null;
        },

        async listUids(afterUid: bigint | null, limit: number): Promise<bigint[]> {
          const start = (afterUid ?? 0n) + 1n;
          const found = await client.search({ uid: `${start}:*` }, { uid: true });
          if (!found || found.length === 0) return [];
          // The `n:*` range always matches the highest UID even when none are
          // strictly greater, so filter explicitly, then sort ascending.
          const uids = found
            .map((n) => BigInt(n))
            .filter((u) => u >= start)
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          return uids.slice(0, limit);
        },

        async fetchRaw(uid: bigint) {
          const msg = await client.fetchOne(
            String(uid),
            { uid: true, source: { maxLength: maxLen }, internalDate: true },
            { uid: true },
          );
          if (!msg || !msg.source) return null;
          const internalDate =
            msg.internalDate instanceof Date
              ? msg.internalDate
              : msg.internalDate
                ? new Date(msg.internalDate)
                : null;
          return { source: msg.source, internalDate };
        },

        async close(): Promise<void> {
          try {
            lock.release();
          } finally {
            try {
              await client.logout();
            } catch {
              client.close();
            }
          }
        },
      };
    },
  };
}

/** Predicate a mapper consults to tell our own addresses from correspondents. */
export type IsOurAddress = (email: string) => Promise<boolean> | boolean;

export interface MimeMapContext {
  source: EmailSource;
  role: MailboxRoleName;
  internalDate: Date | null;
  isOurAddress: IsOurAddress;
  now?: Date;
  maxBodyChars?: number;
}

/**
 * Map a raw MIME message onto the provider-neutral `ParsedEmail`.
 *
 * Reuses the exact helpers the Resend mapper uses (`normalizeMessageId`,
 * `parseReferencesHeader`, `normalizeAddress`, `resolveOccurredAt`) so a message
 * arriving over both transports produces identical threading keys and collapses
 * to one CRM row. A malformed message does not throw here: mailparser is lenient,
 * so a body with no headers maps to a degraded record (unknown From, synthetic
 * id) which the caller can still store. It only rejects on input mailparser
 * genuinely cannot read, and the sync loop dead-letters that.
 */
export async function mapMimeToParsedEmail(
  raw: Buffer,
  ctx: MimeMapContext,
): Promise<ParsedEmail> {
  const parsed: ParsedMail = await simpleParser(raw, {
    skipImageLinks: true,
    maxHtmlLengthToParse: MAX_HTML_LENGTH,
  });
  const maxBody = ctx.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS;

  const from = firstAddress(parsed.from) ?? { email: "unknown@invalid" };

  const rfcMessageId = normalizeMessageId(parsed.messageId);
  const occurred = resolveOccurredAt({
    headerDate: parsed.date ?? null,
    internalDate: ctx.internalDate,
    now: ctx.now,
  });

  let direction: EmailDirectionName = "INBOUND";
  if (ctx.role === "OUTBOUND_ARCHIVE") {
    // The outgoing-control archive receives our own sent mail, but an inbound
    // reply can land there too. From decides — never the folder.
    direction = (await ctx.isOurAddress(from.email)) ? "OUTBOUND" : "INBOUND";
  }

  const html = typeof parsed.html === "string" ? parsed.html : null;

  return {
    provider: "TIMEWEB_IMAP",
    direction,
    from,
    to: addressList(parsed.to),
    cc: addressList(parsed.cc),
    bcc: addressList(parsed.bcc),
    subject: parsed.subject ?? "",
    bodyText: truncate(parsed.text ?? null, maxBody),
    bodyHtml: truncate(html, maxBody),
    rfcMessageId: rfcMessageId ?? buildSyntheticMessageId("TIMEWEB_IMAP", ctx.source),
    rfcMessageIdSynthetic: rfcMessageId === null,
    inReplyTo: normalizeMessageId(parsed.inReplyTo),
    references: parseReferencesHeader(referencesToString(parsed.references)),
    occurredAt: occurred.occurredAt,
    occurredAtEstimated: occurred.estimated,
    source: ctx.source,
    providerLocator: {
      kind: "imap",
      mailbox: ctx.source.mailbox,
      folder: ctx.source.folder,
      uidValidity: ctx.source.uidValidity === null ? null : ctx.source.uidValidity.toString(),
      uid: ctx.source.uid === null ? null : ctx.source.uid.toString(),
    },
    attachments: parsed.attachments.map(toAttachmentMeta),
  };
}

/**
 * Adapt `mapMimeToParsedEmail` to the sync loop's `MimeMapper` shape by closing
 * over the identity lookup. INBOUND sources never consult it.
 */
export function createMimeMapper(opts: {
  isOurAddress: IsOurAddress;
  now?: () => Date;
  maxBodyChars?: number;
}): MimeMapper {
  return (raw, ctx) =>
    mapMimeToParsedEmail(raw, {
      source: ctx.source,
      role: ctx.role,
      internalDate: ctx.internalDate,
      isOurAddress: opts.isOurAddress,
      now: opts.now?.(),
      maxBodyChars: opts.maxBodyChars,
    });
}

/**
 * Identity predicate backed by the `MailIdentity` registry: an address is ours
 * when it has an active row. Addresses are normalized before lookup because the
 * registry stores them lower-cased.
 */
export function createMailIdentityLookup(): IsOurAddress {
  return async (email: string): Promise<boolean> => {
    const norm = email.trim().toLowerCase();
    if (!norm) return false;
    const row = await (db as unknown as {
      mailIdentity: { findFirst(args: unknown): Promise<unknown> };
    }).mailIdentity.findFirst({
      where: { address: norm, isActive: true },
      select: { id: true },
    });
    return row !== null;
  };
}

function firstAddress(obj: AddressObject | AddressObject[] | undefined): EmailAddress | null {
  const list = addressList(obj);
  return list[0] ?? null;
}

/** Flatten mailparser's structured addresses back into raw strings, then reuse
 * the shared normalizer so IMAP and Resend produce identical `EmailAddress`es. */
function addressList(obj: AddressObject | AddressObject[] | undefined): EmailAddress[] {
  if (!obj) return [];
  const objects = Array.isArray(obj) ? obj : [obj];
  const raw: string[] = [];
  for (const o of objects) {
    for (const v of o.value ?? []) {
      if (v.group && v.group.length > 0) {
        for (const g of v.group) pushRaw(raw, g.address, g.name);
      } else {
        pushRaw(raw, v.address, v.name);
      }
    }
  }
  return normalizeAddressList(raw);
}

function pushRaw(out: string[], address: string | undefined, name: string | undefined): void {
  if (!address) return;
  out.push(name && name.trim().length > 0 ? `"${name}" <${address}>` : address);
}

function referencesToString(refs: string | string[] | undefined): string | null {
  if (!refs) return null;
  return Array.isArray(refs) ? refs.join(" ") : refs;
}

function toAttachmentMeta(att: ParsedMail["attachments"][number], index: number): EmailAttachmentMeta {
  const cid = cleanContentId(att.contentId ?? att.cid ?? null);
  return {
    // Prefer the MIME part id (usable by the Story 4 attachment fetch), then the
    // content id, then a positional fallback — always a stable, non-empty id.
    id: att.partId ?? cid ?? `att-${index + 1}`,
    filename: att.filename ?? `attachment-${index + 1}`,
    contentType: att.contentType ?? null,
    contentDisposition: att.contentDisposition ?? null,
    contentId: cid,
    size: typeof att.size === "number" ? att.size : null,
  };
}

function cleanContentId(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^<|>$/g, "");
  return trimmed.length > 0 ? trimmed : null;
}

function truncate(value: string | null, max: number): string | null {
  if (value === null) return null;
  return value.length > max ? value.slice(0, max) : value;
}

// Re-export so callers reaching for the address normalizer through the adapter
// get the shared implementation rather than a second copy.
export { normalizeAddress };
