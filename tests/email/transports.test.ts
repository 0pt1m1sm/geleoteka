import { describe, it, expect } from "vitest";

import {
  selectTransport,
  createMockTransport,
  normalizeTransportName,
  TRANSPORT_UNKNOWN_PREFIX,
  type OutboundMessage,
  type Transport,
} from "@/lib/email/transport";
import { createResendTransport } from "@/lib/email/providers/resend";
import {
  createSmtpTransport,
  type SmtpSendMailOptions,
  type SmtpTransporter,
} from "@/lib/email/providers/smtp";
import { renderBookingConfirmation } from "@/lib/email/templates/booking-confirmation";
import { renderEstimateSent } from "@/lib/email/templates/estimate-sent";
import { renderRegistrationWelcome } from "@/lib/email/templates/registration-welcome";
import { renderPartOrderConfirmation } from "@/lib/email/templates/part-order-confirmation";
import { renderRentalBookingConfirmation } from "@/lib/email/templates/rental-booking-confirmation";

/**
 * Contract tests for the outbound transport abstraction (Task 5).
 *
 * Both adapters — legacy Resend and generic SMTP — implement the same
 * channel-neutral `Transport`. The suite proves that every real message shape
 * (the five transactional templates + the CRM reply) survives BOTH adapters
 * with identical threading keys, that a definite rejection differs from an
 * ambiguous timeout, and that the router never fails over to the other
 * transport (which could double-send after an ambiguous timeout).
 */

const THREAD = {
  messageId: "<msg-1@geleoteka.ru>",
  inReplyTo: "<parent-9@geleoteka.ru>",
  references: ["<root-0@peer.example>", "<parent-9@geleoteka.ru>"],
};

/** Render each template and the reply into the subject/html/text a call site sends. */
function scenarioBodies(): Array<{ label: string; subject: string; html: string; text: string }> {
  const booking = renderBookingConfirmation({
    customerName: "Иван",
    dateTime: new Date("2026-08-01T10:00:00Z"),
    vehicleSummary: "G 63 AMG",
    services: ["ТО", "Диагностика"],
    address: "Москва, ул. Пример 1",
  });
  const estimate = renderEstimateSent({
    customerName: "Иван",
    estimateNumber: "0007",
    total: 1234500,
    validUntil: new Date("2026-08-10T00:00:00Z"),
    viewUrl: "https://geleoteka.ru/estimate/tok?id=e1",
    pdfUrl: "https://geleoteka.ru/api/estimates/e1/pdf?token=tok",
  });
  const registration = renderRegistrationWelcome({
    customerName: "Иван",
    loginUrl: "https://geleoteka.ru/login",
  });
  const partOrder = renderPartOrderConfirmation({
    customerName: "Иван",
    orderId: "po_abcdef",
    items: [{ name: "Фильтр", qty: 2, unitPrice: 100000, total: 200000 }],
    total: 200000,
    contactPhone: "+7 900 000-00-00",
  });
  const rental = renderRentalBookingConfirmation({
    customerName: "Иван",
    vehicleSummary: "G 63 AMG",
    startAt: new Date("2026-08-01T10:00:00Z"),
    endAt: new Date("2026-08-05T10:00:00Z"),
    totalDays: 4,
    totalPrice: 8000000,
    pickupAddress: "Москва, ул. Пример 1",
  });
  // The CRM reply is not a template — the action composes it inline.
  const reply = {
    subject: "Re: Geleoteka — смета №0007 на согласование",
    html: "<p>Здравствуйте! Отвечаю на ваш вопрос.</p><p>— Менеджер, Geleoteka</p>",
    text: "Здравствуйте! Отвечаю на ваш вопрос.\n\n— Менеджер, Geleoteka",
  };

  return [
    { label: "booking", ...booking },
    { label: "estimate", ...estimate },
    { label: "registration", ...registration },
    { label: "part-order", ...partOrder },
    { label: "rental", ...rental },
    { label: "crm-reply", ...reply },
  ];
}

function messageFor(body: { subject: string; html: string; text: string }): OutboundMessage {
  return {
    from: "Geleoteka <sales@geleoteka.ru>",
    to: "client@customer.ru",
    subject: body.subject,
    html: body.html,
    text: body.text,
    replyTo: "sales@geleoteka.ru",
    messageId: THREAD.messageId,
    inReplyTo: THREAD.inReplyTo,
    references: THREAD.references,
  };
}

// ── Fake Resend: capture the JSON request body, script the HTTP response ──────
interface ResendBody {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
  headers?: Record<string, string>;
}
function fakeResendFetch(
  captured: ResendBody[],
  behavior: "ok" | "reject" | "timeout" = "ok",
): typeof fetch {
  return (async (_url: string, init: { body: string }) => {
    captured.push(JSON.parse(init.body) as ResendBody);
    if (behavior === "timeout") {
      throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    }
    if (behavior === "reject") {
      return new Response(JSON.stringify({ message: "Domain not verified", statusCode: 403 }), {
        status: 403,
      });
    }
    return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
  }) as unknown as typeof fetch;
}

// ── Fake SMTP: capture sendMail options, script accept/reject/timeout ─────────
function fakeTransporter(
  captured: SmtpSendMailOptions[],
  behavior: "ok" | "reject" | "timeout" = "ok",
): (opts: unknown) => SmtpTransporter {
  return () => ({
    async sendMail(opts: SmtpSendMailOptions) {
      captured.push(opts);
      if (behavior === "reject") {
        throw Object.assign(new Error("550 mailbox unavailable"), { responseCode: 550 });
      }
      if (behavior === "timeout") {
        // Socket timeout after DATA — no SMTP reply code: outcome ambiguous.
        throw Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" });
      }
      return { messageId: opts.messageId, accepted: [String(opts.to)], rejected: [], response: "250 OK" };
    },
  });
}

function joinRefs(refs: string | string[] | undefined): string {
  if (!refs) return "";
  return Array.isArray(refs) ? refs.join(" ") : refs;
}

describe("transport contract — every template + reply through both adapters", () => {
  it("preserves identical Message-Id / In-Reply-To / References across Resend and SMTP", async () => {
    for (const body of scenarioBodies()) {
      const msg = messageFor(body);

      const resendCaptured: ResendBody[] = [];
      const resend = createResendTransport({ apiKey: "key", fetchImpl: fakeResendFetch(resendCaptured) });

      const smtpCaptured: SmtpSendMailOptions[] = [];
      const smtp = createSmtpTransport({
        host: "smtp.example.ru",
        port: 465,
        secure: true,
        auth: { user: "sales@geleoteka.ru", pass: "secret" },
        createTransporter: fakeTransporter(smtpCaptured),
      });

      const r1 = await resend.deliver(msg);
      const r2 = await smtp.deliver(msg);

      // Both accept on success and carry a structured result.
      expect(r1, `${body.label} resend accepted`).toMatchObject({ accepted: true });
      expect(r2, `${body.label} smtp accepted`).toMatchObject({ accepted: true });
      expect(typeof r1.providerMessageId).toBe("string");

      const rb = resendCaptured.at(-1)!;
      const so = smtpCaptured.at(-1)!;

      // Resend maps threading onto explicit headers.
      expect(rb.headers?.["Message-Id"]).toBe(THREAD.messageId);
      expect(rb.headers?.["In-Reply-To"]).toBe(THREAD.inReplyTo);
      expect(rb.headers?.["References"]).toBe(THREAD.references.join(" "));
      // Subject/body/reply-to survive unchanged.
      expect(rb.subject).toBe(body.subject);
      expect(rb.html).toBe(body.html);
      expect(rb.reply_to).toBe("sales@geleoteka.ru");

      // SMTP carries the same ids through nodemailer's native fields.
      expect(so.messageId).toBe(THREAD.messageId);
      expect(so.inReplyTo).toBe(THREAD.inReplyTo);
      expect(joinRefs(so.references)).toBe(THREAD.references.join(" "));
      expect(so.subject).toBe(body.subject);
      expect(so.replyTo).toBe("sales@geleoteka.ru");

      // Cross-adapter parity: the two agree byte-for-byte on the threading keys.
      expect(so.messageId).toBe(rb.headers?.["Message-Id"]);
      expect(joinRefs(so.references)).toBe(rb.headers?.["References"]);
    }
  });

  it("omits threading headers when the message has none (non-threaded first send)", async () => {
    const resendCaptured: ResendBody[] = [];
    const resend = createResendTransport({ apiKey: "key", fetchImpl: fakeResendFetch(resendCaptured) });
    await resend.deliver({
      from: "a@b.ru",
      to: "c@d.ru",
      subject: "hi",
      html: "<p>hi</p>",
    });
    expect(resendCaptured.at(-1)!.headers).toBeUndefined();
  });
});

describe("transport result semantics — accept / reject / unknown", () => {
  it("Resend: explicit HTTP error is a definite reject, not unknown", async () => {
    const resend = createResendTransport({ apiKey: "key", fetchImpl: fakeResendFetch([], "reject") });
    const res = await resend.deliver(messageFor(scenarioBodies()[0]));
    expect(res.accepted).toBe(false);
    expect(res.unknown).toBeFalsy();
    expect(res.error).toContain("Domain not verified");
  });

  it("Resend: a network/abort after send is UNKNOWN, never a definite reject", async () => {
    const resend = createResendTransport({ apiKey: "key", fetchImpl: fakeResendFetch([], "timeout") });
    const res = await resend.deliver(messageFor(scenarioBodies()[0]));
    expect(res.accepted).toBe(false);
    expect(res.unknown).toBe(true);
  });

  it("SMTP: an SMTP reply code is a definite reject, not unknown", async () => {
    const smtp = createSmtpTransport({
      host: "h",
      port: 465,
      secure: true,
      auth: { user: "u", pass: "p" },
      createTransporter: fakeTransporter([], "reject"),
    });
    const res = await smtp.deliver(messageFor(scenarioBodies()[0]));
    expect(res.accepted).toBe(false);
    expect(res.unknown).toBeFalsy();
    expect(res.error).toContain("550");
  });

  it("SMTP: a socket timeout (no reply code) is UNKNOWN, never a definite reject", async () => {
    const smtp = createSmtpTransport({
      host: "h",
      port: 465,
      secure: true,
      auth: { user: "u", pass: "p" },
      createTransporter: fakeTransporter([], "timeout"),
    });
    const res = await smtp.deliver(messageFor(scenarioBodies()[0]));
    expect(res.accepted).toBe(false);
    expect(res.unknown).toBe(true);
  });
});

describe("transport router — one config flag, no automatic failover", () => {
  const smtp: Transport = { name: "smtp", async deliver() { return { accepted: true }; } };
  let resendCalls = 0;
  const resend: Transport = {
    name: "resend",
    async deliver() {
      resendCalls += 1;
      return { accepted: true };
    },
  };

  it("routes to exactly the configured transport", () => {
    expect(selectTransport("smtp", { smtp, resend }).name).toBe("smtp");
    expect(selectTransport("resend", { smtp, resend }).name).toBe("resend");
  });

  it("falls back to a mock (not the other transport) when the chosen one is unconfigured", async () => {
    const chosen = selectTransport("smtp", { smtp: null, resend });
    expect(chosen.name).toBe("smtp-mock");
    const res = await chosen.deliver(messageFor(scenarioBodies()[0]));
    expect(res.accepted).toBe(true);
    // The resend adapter was never consulted — no silent failover.
    expect(resendCalls).toBe(0);
  });

  it("a failing chosen transport never triggers the other (no auto-failover)", async () => {
    const failing: Transport = { name: "smtp", async deliver() { return { accepted: false, error: "boom" }; } };
    const chosen = selectTransport("smtp", { smtp: failing, resend });
    const res = await chosen.deliver(messageFor(scenarioBodies()[0]));
    expect(res.accepted).toBe(false);
    expect(resendCalls).toBe(0);
  });

  it("normalizeTransportName defaults to smtp and only recognizes resend explicitly", () => {
    expect(normalizeTransportName(undefined)).toBe("smtp");
    expect(normalizeTransportName("")).toBe("smtp");
    expect(normalizeTransportName("nonsense")).toBe("smtp");
    expect(normalizeTransportName("RESEND")).toBe("resend");
    expect(normalizeTransportName(" resend ")).toBe("resend");
    expect(normalizeTransportName("smtp")).toBe("smtp");
  });

  it("mock transport reports success without any network side effect", async () => {
    const mock = createMockTransport("smtp");
    const res = await mock.deliver(messageFor(scenarioBodies()[0]));
    expect(res).toMatchObject({ accepted: true });
  });
});

describe("unknown-delivery sentinel is a stable, exported contract", () => {
  it("exposes the prefix the facade/log layer key on", () => {
    expect(typeof TRANSPORT_UNKNOWN_PREFIX).toBe("string");
    expect(TRANSPORT_UNKNOWN_PREFIX.length).toBeGreaterThan(0);
  });
});
