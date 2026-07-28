/**
 * Channel-neutral outbound transport contract.
 *
 * This is the seam the whole platform hangs the "send a message to a customer"
 * capability on. Today the only channel is email and the only adapters are
 * generic SMTP (the default) and Resend (a removable legacy adapter). The names
 * here are deliberately channel-neutral — `Transport`, `deliver`,
 * `TransportResult` — so that a Telegram or WhatsApp adapter can implement the
 * same interface tomorrow without any of this file, the facade, or the CRM call
 * sites changing. That mirrors the omnichannel model (amoCRM/Kommo): thin
 * per-channel adapters over one normalized core.
 *
 * Nothing here is server-only: it is pure types + a pure router + a mock, so the
 * contract can be unit-tested without a DB, secrets, or a live provider. The
 * server-only wiring (reading settings, building the real adapters) lives in the
 * `sendEmail` facade in `lib/email/send.ts`.
 */

export type TransportName = "smtp" | "resend";

/** The channel that runs when no transport is configured. */
export const DEFAULT_TRANSPORT: TransportName = "smtp";

/** Reply-To used when no `EMAIL_REPLY_TO` is configured (Geleoteka default). */
export const DEFAULT_EMAIL_REPLY_TO = "info@geleoteka.ru";

/**
 * A normalized message handed to a transport. Email-shaped for now; a future
 * channel adapter simply ignores the fields it has no use for. `from` and
 * `replyTo` are resolved by the facade from tenant config, not the caller, so
 * the adapters stay identity-agnostic.
 */
export interface OutboundMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** RFC 5322 Message-Id, bracket-wrapped. Stamped so replies thread back. */
  messageId?: string;
  inReplyTo?: string;
  /** RFC order, oldest ancestor first. Joined with spaces by the adapter. */
  references?: string[];
  /** Upper bound on the wire operation; adapters treat 0/undefined as default. */
  timeoutMs?: number;
}

/**
 * Structured outcome of one delivery attempt. Three distinguishable states:
 *
 *   - `accepted: true`                — provider took custody (HTTP 200 / SMTP
 *     250). NOT proof of inbox delivery; only a DSN/provider event proves that.
 *   - `accepted: false, unknown: falsy` — a DEFINITE rejection (the provider
 *     answered with an error code). Safe to mark failed; nothing was delivered.
 *   - `accepted: false, unknown: true`  — an AMBIGUOUS timeout/network fault
 *     after the payload may already have been handed off. The message might or
 *     might not have been delivered, so it must NOT be auto-retried through
 *     another transport (that is how a double-send happens).
 */
export interface TransportResult {
  accepted: boolean;
  providerMessageId?: string;
  error?: string;
  unknown?: boolean;
}

export interface Transport {
  /** Stable identifier for logs/diagnostics, e.g. "smtp", "resend", "smtp-mock". */
  readonly name: string;
  deliver(message: OutboundMessage): Promise<TransportResult>;
}

/**
 * Marker prefixed onto the facade's error string when a send ended in the
 * ambiguous timeout state above. The log layer keys on it to record an
 * UNKNOWN-like outcome instead of a FALSE `FAILED`, so an operator knows to
 * verify before resending rather than blindly retrying a message that may have
 * gone out.
 */
export const TRANSPORT_UNKNOWN_PREFIX = "[TIMEOUT_UNKNOWN]";

/**
 * Normalize the `EMAIL_TRANSPORT` config value. Defaults to `smtp` (the generic,
 * provider-independent transport). Only an explicit `resend` opts into the
 * legacy adapter — a typo or empty value must never silently pick a provider.
 */
export function normalizeTransportName(raw: string | null | undefined): TransportName {
  return (raw ?? "").trim().toLowerCase() === "resend" ? "resend" : DEFAULT_TRANSPORT;
}

/**
 * A transport that performs no I/O and always reports success. Used when the
 * chosen transport is not configured (no SMTP password / no Resend key), so dev
 * and preview environments keep working exactly as before — the send is logged,
 * not delivered.
 */
export function createMockTransport(name: TransportName | string): Transport {
  return {
    name: `${name}-mock`,
    async deliver(message: OutboundMessage): Promise<TransportResult> {
      console.log(
        `[EMAIL MOCK] via ${name} to=${message.to} subject="${message.subject}" messageId=${message.messageId ?? "—"}`,
      );
      return { accepted: true, providerMessageId: undefined };
    },
  };
}

/**
 * Pick the configured adapter. This is the ONLY place transport selection
 * happens, and it deliberately cannot fail over: it returns exactly the named
 * adapter, or a mock when that adapter is unconfigured — never the other one.
 * An ambiguous timeout on the chosen transport must not silently re-send
 * through a second provider.
 */
export function selectTransport(
  name: TransportName,
  adapters: { smtp: Transport | null; resend: Transport | null },
): Transport {
  if (name === "resend") return adapters.resend ?? createMockTransport("resend");
  return adapters.smtp ?? createMockTransport("smtp");
}
