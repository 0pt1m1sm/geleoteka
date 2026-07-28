import "server-only";
import * as os from "node:os";

import { db } from "@/lib/db";
import { ingestEmail } from "@/lib/email/ingest";
import {
  createMailIdentityLookup,
  createMimeMapper,
  createTimewebImapPort,
  resolveImapCredential,
} from "@/lib/email/providers/timeweb-imap";
import type {
  ImapPort,
  MailboxRoleName,
  MailSyncDb,
  MailSyncSource,
  SyncConfig,
  SyncDeps,
} from "@/lib/email/sync";
import { getSetting } from "@/lib/settings";

/**
 * Assembles the runtime the worker and the internal route both need, keeping the
 * secret/non-secret split honest:
 *
 *   - Non-secret (host, port, source list, the on/off flag) comes from the
 *     Setting table with env fallback, exactly like every other integration.
 *   - Secret (mailbox passwords) is read only inside the credential resolver,
 *     straight from process.env, and never returned to a caller or logged.
 */

const DEFAULT_HOST = "imap.timeweb.ru";
const DEFAULT_PORT = 993;

export interface MailSyncRuntime {
  enabled: boolean;
  config: SyncConfig;
  deps: SyncDeps;
}

export async function loadMailSyncRuntime(): Promise<MailSyncRuntime> {
  const [enabledRaw, host, portRaw, sourcesRaw] = await Promise.all([
    getSetting("MAIL_SYNC_ENABLED"),
    getSetting("TIMEWEB_IMAP_HOST"),
    getSetting("TIMEWEB_IMAP_PORT"),
    getSetting("MAIL_SYNC_SOURCES"),
  ]);

  const enabled = parseBool(enabledRaw);
  const sources = parseSources(sourcesRaw);

  const port = createTimewebImapPort({
    host: host?.trim() || DEFAULT_HOST,
    port: parsePort(portRaw),
    credential: (mailbox) => resolveImapCredential(mailbox),
  });

  const mapper = createMimeMapper({ isOurAddress: createMailIdentityLookup() });

  const config: SyncConfig = {
    sources,
    owner: `${os.hostname()}#${process.pid}`,
    batchSize: parsePositiveInt(process.env.MAIL_SYNC_BATCH_SIZE, 50),
    leaseMs: parsePositiveInt(process.env.MAIL_SYNC_LEASE_MS, 120_000),
  };

  const deps: SyncDeps = {
    db: db as unknown as MailSyncDb,
    port,
    mapper,
    ingest: (parsed) => ingestEmail(parsed),
    log: (msg, extra) => console.log(`[mail-sync] ${msg}`, extra ?? ""),
  };

  return { enabled, config, deps };
}

/**
 * Build ONLY the read-only IMAP port from settings — no cursor, mapper or lease
 * machinery. The attachment route needs to peek one part out of one message and
 * nothing more, so it reuses the exact same credential resolver and TLS config
 * as the worker without pulling in the whole sync runtime or the on/off flag.
 */
export async function buildImapPortFromSettings(): Promise<ImapPort> {
  const [host, portRaw] = await Promise.all([
    getSetting("TIMEWEB_IMAP_HOST"),
    getSetting("TIMEWEB_IMAP_PORT"),
  ]);
  return createTimewebImapPort({
    host: host?.trim() || DEFAULT_HOST,
    port: parsePort(portRaw),
    credential: (mailbox) => resolveImapCredential(mailbox),
  });
}

/**
 * Parse the source list. Accepts JSON `[{ "mailbox", "folder", "role" }]`.
 * Unknown roles and malformed entries are dropped rather than trusted, so a
 * typo cannot point the worker at an un-classified folder.
 */
export function parseSources(raw: string | null | undefined): MailSyncSource[] {
  if (!raw || raw.trim().length === 0) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error("[mail-sync] MAIL_SYNC_SOURCES is not valid JSON — treating as empty");
    return [];
  }
  if (!Array.isArray(data)) return [];

  const out: MailSyncSource[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const mailbox = typeof e.mailbox === "string" ? e.mailbox.trim().toLowerCase() : "";
    const folder = typeof e.folder === "string" ? e.folder.trim() : "";
    const role = e.role;
    if (!mailbox || !folder) continue;
    if (role !== "INBOUND" && role !== "OUTBOUND_ARCHIVE") continue;
    out.push({ mailbox, folder, role: role as MailboxRoleName });
  }
  return out;
}

function parseBool(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

function parsePort(raw: string | null | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n > 0 && n < 65_536 ? n : DEFAULT_PORT;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
