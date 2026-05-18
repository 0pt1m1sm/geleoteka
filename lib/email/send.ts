import "server-only";
import { getSetting } from "@/lib/settings";

const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://geleoteka.ru";

/** Public origin used by template builders for absolute URLs. */
export const APP_URL = NEXT_PUBLIC_APP_URL;

const REPLY_TO = "info@geleoteka.ru";
const DEFAULT_FALLBACK_FROM = "onboarding@resend.dev";

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
 * Reject placeholder / synthetic / RFC-2606-reserved addresses before they
 * hit Resend. Keeps log noise down and prevents a confused recipient from
 * the e2e-claim-... pattern used elsewhere in the codebase.
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

interface ResendSuccess { id: string }
interface ResendError { name?: string; message?: string; statusCode?: number }

/**
 * Transactional send via the Resend HTTP API. Credentials resolved per
 * call through `getSetting` (DB override at /admin/settings/integrations,
 * falls back to env vars). `getSetting` caches with 60s TTL so per-call
 * overhead is negligible.
 *
 * Failure modes are absorbed: this function never re-throws. Callers run
 * fire-and-forget (`void sendEmail(...).catch(() => {})`).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    if (!isPlausibleEmail(input.to)) {
      console.log(`[EMAIL] skipping placeholder address ${input.to}`);
      return { success: true, messageId: input.messageId };
    }

    const apiKey = await getSetting("RESEND_API_KEY");
    if (!apiKey) {
      console.log(`[EMAIL MOCK] to=${input.to} subject="${input.subject}" messageId=${input.messageId ?? "—"}`);
      return { success: true, messageId: input.messageId };
    }

    const fromVerified = await getSetting("RESEND_FROM");
    const fromFallback = (await getSetting("RESEND_FROM_FALLBACK")) ?? DEFAULT_FALLBACK_FROM;
    const effectiveFrom = fromVerified?.trim() || fromFallback;

    // Threading headers — only included when set so the Resend payload
    // stays the same shape for the original non-threaded send path.
    const headers: Record<string, string> = {};
    if (input.messageId) headers["Message-Id"] = input.messageId;
    if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
    if (input.references && input.references.length > 0) headers["References"] = input.references.join(" ");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: effectiveFrom,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: REPLY_TO,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }),
    });
    const data = (await res.json()) as ResendSuccess | ResendError;
    if (!res.ok || !("id" in data)) {
      const err = data as ResendError;
      console.error(`[EMAIL ERROR] ${res.status}`, err);
      return { success: false, error: err.message ?? `HTTP ${res.status}` };
    }
    console.log(`[EMAIL] sent to ${input.to} id=${data.id}`);
    return { success: true, id: data.id, messageId: input.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[EMAIL ERROR] threw", message);
    return { success: false, error: message };
  }
}
