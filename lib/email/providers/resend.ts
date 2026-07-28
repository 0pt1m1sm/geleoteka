import type { OutboundMessage, Transport, TransportResult } from "@/lib/email/transport";

/**
 * Resend adapter — LEGACY, OPTIONAL, REMOVABLE.
 *
 * Resend was the original transactional transport. The platform is moving to a
 * multi-tenant model where each auto-service brings its own mail hosting, which
 * generic SMTP serves and Resend does not. This adapter therefore exists only as
 * a transitional escape hatch: it keeps working when `EMAIL_TRANSPORT=resend`,
 * but the default is `smtp` and this file is expected to be deleted after the
 * production cutover (plan Task 6–7). It carries no config-reading logic — the
 * facade injects the API key — so it stays a pure, testable edge.
 *
 * This is a straight port of the fetch call that used to live inline in
 * `lib/email/send.ts`; threading headers and `reply_to` are preserved exactly.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 20_000;

type FetchLike = typeof fetch;

export interface ResendTransportConfig {
  apiKey: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: FetchLike;
  /** Override the API endpoint (tests / self-hosted). */
  endpoint?: string;
}

interface ResendSuccess {
  id: string;
}
interface ResendError {
  name?: string;
  message?: string;
  statusCode?: number;
}

export function createResendTransport(config: ResendTransportConfig): Transport {
  const doFetch: FetchLike = config.fetchImpl ?? fetch;
  const endpoint = config.endpoint ?? RESEND_ENDPOINT;

  return {
    name: "resend",
    async deliver(message: OutboundMessage): Promise<TransportResult> {
      // Threading headers are only attached when present, so a first,
      // non-threaded send keeps the exact payload shape it had before.
      const headers: Record<string, string> = {};
      if (message.messageId) headers["Message-Id"] = message.messageId;
      if (message.inReplyTo) headers["In-Reply-To"] = message.inReplyTo;
      if (message.references && message.references.length > 0) {
        headers["References"] = message.references.join(" ");
      }

      const controller = new AbortController();
      const timeoutMs = message.timeoutMs && message.timeoutMs > 0 ? message.timeoutMs : DEFAULT_TIMEOUT_MS;
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await doFetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: message.from,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
            reply_to: message.replyTo,
            ...(Object.keys(headers).length > 0 ? { headers } : {}),
          }),
          signal: controller.signal,
        });
      } catch (err) {
        // The request threw before any HTTP response came back: abort/timeout or
        // a network fault. The message MAY already have reached Resend, so this
        // is UNKNOWN, not a definite reject — do not let anything auto-retry it.
        const messageStr = err instanceof Error ? err.message : String(err);
        return { accepted: false, unknown: true, error: messageStr };
      } finally {
        clearTimeout(timer);
      }

      // The server answered, so whatever it says is definitive (not unknown).
      let data: ResendSuccess | ResendError;
      try {
        data = (await res.json()) as ResendSuccess | ResendError;
      } catch {
        data = {};
      }
      if (!res.ok || !("id" in data)) {
        const err = data as ResendError;
        return { accepted: false, error: err.message ?? `HTTP ${res.status}` };
      }
      return { accepted: true, providerMessageId: (data as ResendSuccess).id };
    },
  };
}
