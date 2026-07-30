import { describe, expect, it } from "vitest";

import { mapMimeToParsedEmail } from "@/lib/email/providers/timeweb-imap";
import { buildSyntheticMessageId, type EmailSource } from "@/lib/email/types";
import { buildRawEmail } from "./fake-imap";

/**
 * The IMAP MIME mapper. These pin the half of the cross-provider contract that
 * lives on the Timeweb side: the same threading keys the Resend mapper produces,
 * direction decided from MailIdentity rather than folder, occurredAt from the
 * message rather than the sync, and a malformed message degraded rather than
 * thrown.
 */

const OURS = new Set(["sales@geleoteka.ru", "manager@geleoteka.ru"]);
const isOurAddress = (email: string): boolean => OURS.has(email.toLowerCase());

function inboundSource(uid: bigint = 501n): EmailSource {
  return { mailbox: "sales@geleoteka.ru", folder: "INBOX", uidValidity: 10n, uid };
}
function archiveSource(uid: bigint = 1n): EmailSource {
  return { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX", uidValidity: 7n, uid };
}

describe("mapMimeToParsedEmail", () => {
  it("preserves a real Message-Id and the full threading chain", async () => {
    const raw = buildRawEmail({
      messageId: "<reply-9@example.test>",
      from: '"Иван Клиент" <Customer@Example.TEST>',
      to: "sales@geleoteka.ru",
      subject: "Re: смета",
      date: "Tue, 14 Jul 2026 09:15:00 +0000",
      inReplyTo: "<outbound-1@geleoteka.ru>",
      references: "<root@geleoteka.ru> <outbound-1@geleoteka.ru>",
      text: "Согласен.",
    });

    const parsed = await mapMimeToParsedEmail(raw, {
      source: inboundSource(),
      role: "INBOUND",
      internalDate: new Date("2026-07-14T09:15:40.000Z"),
      isOurAddress,
    });

    expect(parsed.provider).toBe("TIMEWEB_IMAP");
    expect(parsed.rfcMessageId).toBe("<reply-9@example.test>");
    expect(parsed.rfcMessageIdSynthetic).toBe(false);
    expect(parsed.from).toEqual({ email: "customer@example.test", name: "Иван Клиент" });
    expect(parsed.to).toEqual([{ email: "sales@geleoteka.ru" }]);
    expect(parsed.inReplyTo).toBe("<outbound-1@geleoteka.ru>");
    // References stays RFC order: oldest ancestor first.
    expect(parsed.references).toEqual(["<root@geleoteka.ru>", "<outbound-1@geleoteka.ru>"]);
    // The Date header wins over INTERNALDATE.
    expect(parsed.occurredAt.toISOString()).toBe("2026-07-14T09:15:00.000Z");
    expect(parsed.occurredAtEstimated).toBe(false);
    expect(parsed.providerLocator).toEqual({
      kind: "imap",
      mailbox: "sales@geleoteka.ru",
      folder: "INBOX",
      uidValidity: "10",
      uid: "501",
    });
  });

  it("synthesizes a deterministic id from the source tuple when none is present", async () => {
    const source = inboundSource(777n);
    const raw = buildRawEmail({ from: "x@example.test", subject: "no id" });

    const parsed = await mapMimeToParsedEmail(raw, {
      source,
      role: "INBOUND",
      internalDate: null,
      isOurAddress,
    });

    expect(parsed.rfcMessageIdSynthetic).toBe(true);
    expect(parsed.rfcMessageId).toBe(buildSyntheticMessageId("TIMEWEB_IMAP", source));
  });

  it("forces INBOUND for an INBOUND source no matter who the From is", async () => {
    // Even a message that appears to come from one of our own addresses is
    // inbound when it was read from a human INBOX (e.g. a self-addressed note).
    const raw = buildRawEmail({ from: "manager@geleoteka.ru", subject: "self" });
    const parsed = await mapMimeToParsedEmail(raw, {
      source: inboundSource(),
      role: "INBOUND",
      internalDate: null,
      isOurAddress,
    });
    expect(parsed.direction).toBe("INBOUND");
  });

  it("marks an archive message OUTBOUND only when From is one of ours", async () => {
    const outgoing = await mapMimeToParsedEmail(
      buildRawEmail({ from: "Geleoteka <sales@geleoteka.ru>", to: "client@test.ru" }),
      { source: archiveSource(), role: "OUTBOUND_ARCHIVE", internalDate: null, isOurAddress },
    );
    expect(outgoing.direction).toBe("OUTBOUND");

    // An inbound reply can land in the outgoing-control archive too; From, not
    // the folder, is what classifies it.
    const incoming = await mapMimeToParsedEmail(
      buildRawEmail({ from: "client@test.ru", to: "sales@geleoteka.ru" }),
      { source: archiveSource(2n), role: "OUTBOUND_ARCHIVE", internalDate: null, isOurAddress },
    );
    expect(incoming.direction).toBe("INBOUND");
  });

  it("falls back to INTERNALDATE, then flags an estimate when both are absent", async () => {
    const withInternal = await mapMimeToParsedEmail(
      buildRawEmail({ from: "x@example.test" }),
      {
        source: inboundSource(),
        role: "INBOUND",
        internalDate: new Date("2026-07-01T00:00:00.000Z"),
        isOurAddress,
      },
    );
    expect(withInternal.occurredAt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(withInternal.occurredAtEstimated).toBe(false);

    const now = new Date("2026-07-20T12:00:00.000Z");
    const estimated = await mapMimeToParsedEmail(buildRawEmail({ from: "x@example.test" }), {
      source: inboundSource(),
      role: "INBOUND",
      internalDate: null,
      isOurAddress,
      now,
    });
    expect(estimated.occurredAtEstimated).toBe(true);
    expect(estimated.occurredAt.toISOString()).toBe(now.toISOString());
  });

  it("degrades a header-less blob instead of throwing", async () => {
    const source = inboundSource(999n);
    const parsed = await mapMimeToParsedEmail(Buffer.from("this is not a real email", "utf8"), {
      source,
      role: "INBOUND",
      internalDate: null,
      isOurAddress,
      now: new Date("2026-07-20T12:00:00.000Z"),
    });

    expect(parsed.from).toEqual({ email: "unknown@invalid" });
    expect(parsed.rfcMessageIdSynthetic).toBe(true);
    expect(parsed.rfcMessageId).toBe(buildSyntheticMessageId("TIMEWEB_IMAP", source));
    expect(parsed.occurredAtEstimated).toBe(true);
  });

  it("carries attachment metadata without downloading bodies", async () => {
    const raw = Buffer.from(
      [
        "From: client@test.ru",
        "To: sales@geleoteka.ru",
        "Subject: with attachment",
        "Message-ID: <att-msg@example.test>",
        "MIME-Version: 1.0",
        'Content-Type: multipart/mixed; boundary="b1"',
        "",
        "--b1",
        'Content-Type: text/plain; charset="utf-8"',
        "",
        "See attached.",
        "--b1",
        'Content-Type: application/pdf; name="смета.pdf"',
        "Content-Disposition: attachment; filename=\"смета.pdf\"",
        "Content-Transfer-Encoding: base64",
        "Content-ID: <cid-1>",
        "",
        Buffer.from("%PDF-1.4 fake").toString("base64"),
        "--b1--",
        "",
      ].join("\r\n"),
      "utf8",
    );

    const parsed = await mapMimeToParsedEmail(raw, {
      source: inboundSource(),
      role: "INBOUND",
      internalDate: null,
      isOurAddress,
    });

    expect(parsed.attachments).toHaveLength(1);
    const [att] = parsed.attachments;
    expect(att.filename).toBe("смета.pdf");
    expect(att.contentType).toBe("application/pdf");
    expect(att.contentDisposition).toBe("attachment");
    expect(att.contentId).toBe("cid-1");
  });
});
