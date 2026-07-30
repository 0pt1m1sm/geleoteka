import "server-only";
import { getSetting } from "@/lib/settings";
import { createResendTransport } from "@/lib/email/providers/resend";
import { createSmtpTransport } from "@/lib/email/providers/smtp";
import {
  normalizeTransportName,
  selectTransport,
  TRANSPORT_UNKNOWN_PREFIX,
  DEFAULT_EMAIL_REPLY_TO,
  type OutboundMessage,
  type Transport,
} from "@/lib/email/transport";

const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";

/** Public origin used by template builders for absolute URLs. */
export const APP_URL = NEXT_PUBLIC_APP_URL;

const DEFAULT_FALLBACK_FROM = "onboarding@resend.dev";
const DEFAULT_SMTP_HOST = "smtp.timeweb.ru";
const DEFAULT_SMTP_PORT = 465;
const SEND_TIMEOUT_MS = 20_000;

const RESERVED_DOMAINS: ReadonlySet<string> = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.test",
  "test",
  "localhost",
]);
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_LOCAL_RE = /^[0-9a-f]{16,}$/i;

/**
 * Reject placeholder / synthetic / RFC-2606-reserved addresses before they hit
 * a transport. Keeps log noise down and prevents a confused recipient from the
 * e2e-claim-... pattern used elsewhere in the codebase.
 */
export function isPlausibleEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!BASIC_EMAIL_RE.test(value)) return false;
  const [local, domain] = value.toLowerCase().split("@");
  if (RESERVED_DOMAINS.has(domain)) return false;
  if (HEX_LOCAL_RE.test(local)) return false;
  if (local.startsWith("e2e-claim-")) return false;
  return true;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * RFC 5322 Message-Id, bracket-wrapped (e.g. `<abc@geleoteka.ru>`).
   * Stamped as the outbound `Message-Id` header so an inbound reply's
   * `In-Reply-To` matches `CommunicationLog.externalId` exactly.
   */
  messageId?: string;
  /** Threading: parent message id (also bracket-wrapped). */
  inReplyTo?: string;
  /** Threading: full chain. Joined with spaces per RFC 5322. */
  references?: string[];
}

export type SendEmailResult =
  | { success: true; id?: string; messageId?: string }
  | { success: false; error: string };

/**
 * Resolve the visible `From`. Tenant-configurable via `EMAIL_FROM`; the legacy
 * `RESEND_FROM` / `RESEND_FROM_FALLBACK` keys are still honored so an existing
 * deployment keeps sending without a settings change.
 */
export async function resolveEmailFrom(): Promise<string> {
  const explicit = (await getSetting("EMAIL_FROM"))?.trim();
  if (explicit) return explicit;
  const resendFrom = (await getSetting("RESEND_FROM"))?.trim();
  if (resendFrom) return resendFrom;
  const fallback = (await getSetting("RESEND_FROM_FALLBACK"))?.trim();
  return fallback || DEFAULT_FALLBACK_FROM;
}

/** Resolve the tenant `Reply-To` (was hard-coded to sales@geleoteka.ru). */
export async function resolveEmailReplyTo(): Promise<string> {
  const explicit = (await getSetting("EMAIL_REPLY_TO"))?.trim();
  return explicit || DEFAULT_EMAIL_REPLY_TO;
}

/** Build the Resend adapter from settings, or null when it isn't configured. */
async function buildResendAdapter(): Promise<Transport | null> {
  const apiKey = (await getSetting("RESEND_API_KEY"))?.trim();
  if (!apiKey) return null;
  return createResendTransport({ apiKey });
}

/**
 * Build the generic SMTP adapter from settings, or null when it isn't
 * configured. The password is read straight from secret env — never from the
 * plaintext Setting table — mirroring the IMAP credential rule.
 */
async function buildSmtpAdapter(): Promise<Transport | null> {
  const [hostRaw, portRaw, secureRaw, userRaw] = await Promise.all([
    getSetting("SMTP_HOST"),
    getSetting("SMTP_PORT"),
    getSetting("SMTP_SECURE"),
    getSetting("SMTP_USER"),
  ]);
  const user = userRaw?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  // No credential → not configured → fall back to mock (log-only), exactly like
  // Resend with no API key. A generic SMTP send needs both a login and a secret.
  if (!user || !pass) return null;

  const host = hostRaw?.trim() || DEFAULT_SMTP_HOST;
  const port = parsePort(portRaw);
  const secure = secureRaw === undefined || secureRaw === null ? port === 465 : parseBool(secureRaw, port === 465);
  return createSmtpTransport({ host, port, secure, auth: { user, pass } });
}

/**
 * Resolve the single configured transport. Builds ONLY the selected adapter (no
 * failover means no reason to construct the other) and routes through the pure
 * `selectTransport`, which falls back to a mock when the chosen adapter is
 * unconfigured — never to the other provider.
 */
async function resolveTransport(): Promise<Transport> {
  const name = normalizeTransportName(await getSetting("EMAIL_TRANSPORT"));
  const adapters = {
    smtp: name === "smtp" ? await buildSmtpAdapter() : null,
    resend: name === "resend" ? await buildResendAdapter() : null,
  };
  return selectTransport(name, adapters);
}

/**
 * Transactional send through the configured transport (generic SMTP by default,
 * Resend only when explicitly selected). Credentials resolve per call through
 * `getSetting` (DB override at /admin/settings/integrations, env fallback);
 * `getSetting` caches with 60s TTL so per-call overhead is negligible.
 *
 * Backward-compatible facade: the signature and the success/failure contract are
 * unchanged, so the five transactional call sites and the CRM reply keep working
 * untouched. Failure modes are absorbed: this never re-throws. Callers run
 * fire-and-forget (`void sendEmail(...).catch(() => {})`).
 *
 * A `success: false` whose error starts with `TRANSPORT_UNKNOWN_PREFIX` marks an
 * AMBIGUOUS timeout — the log layer records it as unconfirmed rather than a hard
 * failure so nobody blindly resends a message that may already have gone out.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    if (!isPlausibleEmail(input.to)) {
      console.log(`[EMAIL] skipping placeholder address ${input.to}`);
      return { success: true, messageId: input.messageId };
    }

    const [transport, from, replyTo] = await Promise.all([
      resolveTransport(),
      resolveEmailFrom(),
      resolveEmailReplyTo(),
    ]);

    const message: OutboundMessage = {
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo,
      messageId: input.messageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
      timeoutMs: SEND_TIMEOUT_MS,
    };

    const result = await transport.deliver(message);

    if (result.accepted) {
      console.log(
        `[EMAIL] ${transport.name} accepted to=${input.to} id=${result.providerMessageId ?? "?"}`,
      );
      return { success: true, id: result.providerMessageId, messageId: input.messageId };
    }

    const detail = result.error ?? "transport reported no acceptance";
    if (result.unknown) {
      console.error(`[EMAIL UNKNOWN] ${transport.name} timeout/network after send: ${detail}`);
      return { success: false, error: `${TRANSPORT_UNKNOWN_PREFIX} ${detail}` };
    }
    console.error(`[EMAIL ERROR] ${transport.name} rejected: ${detail}`);
    return { success: false, error: detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[EMAIL ERROR] threw", message);
    return { success: false, error: message };
  }
}

function parsePort(raw: string | null | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n > 0 && n < 65_536 ? n : DEFAULT_SMTP_PORT;
}

function parseBool(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return fallback;
}
