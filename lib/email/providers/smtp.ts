import type { OutboundMessage, Transport, TransportResult } from "@/lib/email/transport";

/**
 * Generic SMTP adapter — the PRIMARY, provider-independent transport.
 *
 * Host, port, TLS mode and credentials all come from config, not from any
 * hard-coded provider. For Geleoteka that config points at Timeweb
 * (`smtp.timeweb.ru:465`), but another tenant/auto-service points it at their
 * own server without touching this code — which is the whole reason the platform
 * dropped Resend as the default. nodemailer is imported lazily inside the
 * default transporter factory so unit tests that inject a fake transporter never
 * load the native module.
 *
 * Connections are NOT pooled: nodemailer opens a fresh connection per send and
 * closes it, so nothing keeps a socket alive across a serverless request. The
 * worker, if it ever needs a pool, configures its own transport separately.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

/** The subset of nodemailer's sendMail options this adapter sets. */
export interface SmtpSendMailOptions {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string | string[];
}

/** The subset of nodemailer's SentMessageInfo this adapter reads. */
export interface SmtpSendInfo {
  messageId?: string;
  accepted?: Array<string | { address: string }>;
  rejected?: Array<string | { address: string }>;
  response?: string;
}

/** The minimal transporter shape — lets tests substitute a fake. */
export interface SmtpTransporter {
  sendMail(options: SmtpSendMailOptions): Promise<SmtpSendInfo>;
}

export interface SmtpTransporterOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  requireTLS?: boolean;
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
  tls?: { rejectUnauthorized: boolean; minVersion?: string; servername?: string };
}

export interface SmtpTransportConfig {
  host: string;
  port: number;
  /** true for implicit TLS (465); false for STARTTLS (587, upgraded via requireTLS). */
  secure: boolean;
  auth: { user: string; pass: string };
  /** Injectable for tests; defaults to nodemailer.createTransport. */
  createTransporter?: (options: SmtpTransporterOptions) => SmtpTransporter;
  timeoutMs?: number;
}

async function defaultCreateTransporter(options: SmtpTransporterOptions): Promise<SmtpTransporter> {
  const nodemailer = (await import("nodemailer")).default;
  // Cast at the boundary: nodemailer's TransportOptions types `tls.minVersion`
  // as a `SecureVersion` literal union, which our plain-string field doesn't
  // narrow to. The runtime shape is exactly what nodemailer expects.
  const createTransport = nodemailer.createTransport as unknown as (opts: SmtpTransporterOptions) => SmtpTransporter;
  return createTransport(options);
}

export function createSmtpTransport(config: SmtpTransportConfig): Transport {
  const timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
  const options: SmtpTransporterOptions = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    // On 587 the connection starts plaintext and must be upgraded; require it so
    // credentials never cross an unencrypted link.
    requireTLS: !config.secure,
    auth: config.auth,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
    // Verify the server certificate; never accept a downgrade.
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: config.host },
  };

  const makeTransporter = config.createTransporter ?? defaultCreateTransporter;
  // Memoize the transporter object (non-pooled, so this holds no live socket).
  let transporterPromise: Promise<SmtpTransporter> | null = null;
  const getTransporter = (): Promise<SmtpTransporter> => {
    if (!transporterPromise) transporterPromise = Promise.resolve(makeTransporter(options));
    return transporterPromise;
  };

  return {
    name: "smtp",
    async deliver(message: OutboundMessage): Promise<TransportResult> {
      let info: SmtpSendInfo;
      try {
        const transporter = await getTransporter();
        info = await transporter.sendMail({
          from: message.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo: message.replyTo,
          // nodemailer stamps these as the corresponding RFC headers, so both
          // adapters agree byte-for-byte on the threading keys.
          messageId: message.messageId,
          inReplyTo: message.inReplyTo,
          references: message.references,
        });
      } catch (err) {
        return classifySmtpError(err);
      }

      // Reaching here means the server issued a 2xx for the transaction. A
      // partially-rejected recipient set (all recipients rejected) is a definite
      // failure; otherwise the message was accepted for the recipient.
      const accepted = countAddresses(info.accepted);
      const rejected = countAddresses(info.rejected);
      if (accepted === 0 && rejected > 0) {
        return { accepted: false, error: `recipient rejected: ${info.response ?? "no 2xx"}` };
      }
      return { accepted: true, providerMessageId: info.messageId ?? message.messageId };
    },
  };
}

/**
 * Split an SMTP failure into a DEFINITE reject vs an AMBIGUOUS timeout.
 *
 * When the server issued an SMTP reply code (`responseCode` is present) it
 * spoke, so the outcome is known — a definite reject, nothing was accepted. Any
 * other failure (socket timeout, connection reset, DNS) happened at the
 * transport layer where we cannot tell whether the DATA was already handed off,
 * so it is UNKNOWN and must never trigger an automatic retry through another
 * provider.
 */
function classifySmtpError(err: unknown): TransportResult {
  const e = err as { responseCode?: number; message?: string } | null;
  const message = e?.message ?? (err instanceof Error ? err.message : String(err));
  if (typeof e?.responseCode === "number") {
    return { accepted: false, error: message };
  }
  return { accepted: false, unknown: true, error: message };
}

function countAddresses(list: Array<string | { address: string }> | undefined): number {
  return Array.isArray(list) ? list.length : 0;
}
