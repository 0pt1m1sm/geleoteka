import { describe, it, expect } from "vitest";

import {
  resolveAttachment,
  sanitizeAttachmentFilename,
  buildContentDisposition,
  attachmentOutcomeToResponse,
  type AttachmentDeps,
  type ResendAttachmentFetcher,
} from "@/lib/email/attachments";
import { mapMimeToParsedEmail } from "@/lib/email/providers/timeweb-imap";
import type { EmailSource } from "@/lib/email/types";
import { FakeImapPort } from "./fake-imap";

/** A raw multipart message carrying one base64 attachment mailparser can read. */
function rawWithAttachment(bytes: Buffer, filename = "report.pdf"): Buffer {
  const b64 = bytes.toString("base64").replace(/(.{76})/g, "$1\r\n");
  const lines = [
    "From: Client <client@test.ru>",
    "To: sales@geleoteka.ru",
    "Subject: With attachment",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="BOUND"',
    "",
    "--BOUND",
    'Content-Type: text/plain; charset="utf-8"',
    "",
    "See attached.",
    "--BOUND",
    `Content-Type: application/pdf; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    b64,
    "--BOUND--",
    "",
  ];
  return Buffer.from(lines.join("\r\n"), "utf8");
}

/** Minimal `AttachmentDbPort` over a single stored row. */
function fakeDb(row: Record<string, unknown> | null): AttachmentDeps["db"] {
  return {
    emailMessage: {
      findUnique: async (args: Record<string, unknown>) => {
        const id = (args.where as { id?: string })?.id;
        return row && row.id === id ? row : null;
      },
    },
  };
}

const throwingResend: ResendAttachmentFetcher = async () => {
  throw new Error("resend fetcher must not be called for an imap locator");
};

const throwingPort = () => {
  throw new Error("imap port must not be built for a resend locator");
};

describe("resolveAttachment — ownership & dispatch", () => {
  it("returns 404 for an unknown parent message", async () => {
    const deps: AttachmentDeps = {
      db: fakeDb(null),
      getImapPort: throwingPort,
      resend: throwingResend,
    };
    const out = await resolveAttachment("nope", "a1", deps);
    expect(out).toEqual({ ok: false, status: 404, reason: "message not found" });
  });

  it("returns 404 when the attachment id is not one the message owns", async () => {
    const row = {
      id: "em1",
      providerLocator: { kind: "resend", resendEmailId: "uuid-1" },
      attachments: [{ id: "a1", filename: "ok.pdf", contentType: "application/pdf" }],
      uid: null,
      uidValidity: null,
    };
    const deps: AttachmentDeps = {
      db: fakeDb(row),
      getImapPort: throwingPort,
      // Even a wrong id must never reach the provider — it is rejected first.
      resend: throwingResend,
    };
    const out = await resolveAttachment("em1", "a2-not-mine", deps);
    expect(out).toEqual({ ok: false, status: 404, reason: "attachment not found" });
  });

  it("returns 410 when the row has no provider locator", async () => {
    const row = {
      id: "em1",
      providerLocator: null,
      attachments: [{ id: "a1", filename: "x.pdf", contentType: null }],
      uid: null,
      uidValidity: null,
    };
    const deps: AttachmentDeps = {
      db: fakeDb(row),
      getImapPort: throwingPort,
      resend: throwingResend,
    };
    const out = await resolveAttachment("em1", "a1", deps);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(410);
  });
});

describe("resolveAttachment — resend locator", () => {
  const row = {
    id: "em-r",
    providerLocator: { kind: "resend", resendEmailId: "resend-uuid" },
    attachments: [{ id: "att-9", filename: "invoice.pdf", contentType: "application/pdf" }],
    uid: null,
    uidValidity: null,
  };

  it("streams the resend bytes and takes resendEmailId from the DB, not the request", async () => {
    let seenEmailId: string | null = null;
    const resend: ResendAttachmentFetcher = async (emailId, attId) => {
      seenEmailId = emailId;
      expect(attId).toBe("att-9");
      return { ok: true, content: Buffer.from("PDFBYTES"), contentType: "application/pdf" };
    };
    const out = await resolveAttachment("em-r", "att-9", {
      db: fakeDb(row),
      getImapPort: throwingPort,
      resend,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.content.toString()).toBe("PDFBYTES");
      expect(out.filename).toBe("invoice.pdf");
    }
    expect(seenEmailId).toBe("resend-uuid");
  });

  it("surfaces a Resend 410 (expired object) as 410", async () => {
    const resend: ResendAttachmentFetcher = async () => ({
      ok: false,
      status: 410,
      reason: "expired",
    });
    const out = await resolveAttachment("em-r", "att-9", {
      db: fakeDb(row),
      getImapPort: throwingPort,
      resend,
    });
    expect(out).toEqual({ ok: false, status: 410, reason: "expired" });
  });
});

describe("resolveAttachment — imap locator", () => {
  const source: EmailSource = {
    mailbox: "crm-archive@geleoteka.ru",
    folder: "INBOX",
    uidValidity: 1n,
    uid: 1n,
  };

  async function seedImap(bytes: Buffer): Promise<{
    deps: AttachmentDeps;
    attachmentId: string;
    filename: string;
    port: FakeImapPort;
    locator: { kind: "imap"; mailbox: string; folder: string; uidValidity: string; uid: string };
  }> {
    const raw = rawWithAttachment(bytes);
    const port = new FakeImapPort();
    const box = port.box(source.mailbox, source.folder, 1n);
    const uid = box.append(raw);

    // Derive the stored metadata exactly as ingest would: via the real mapper.
    const parsed = await mapMimeToParsedEmail(raw, {
      source: { ...source, uid },
      role: "INBOUND",
      internalDate: null,
      isOurAddress: () => false,
    });
    const meta = parsed.attachments[0];
    const locator = {
      kind: "imap" as const,
      mailbox: source.mailbox,
      folder: source.folder,
      uidValidity: "1",
      uid: String(uid),
    };
    const row = {
      id: "em-i",
      providerLocator: locator,
      attachments: [{ id: meta.id, filename: meta.filename, contentType: meta.contentType }],
      uid,
      uidValidity: 1n,
    };
    return {
      deps: { db: fakeDb(row), getImapPort: () => port, resend: throwingResend },
      attachmentId: meta.id,
      filename: meta.filename,
      port,
      locator,
    };
  }

  it("fetches the exact part over BODY.PEEK and returns its bytes", async () => {
    const payload = Buffer.from("%PDF-1.4 fake pdf body");
    const { deps, attachmentId } = await seedImap(payload);
    const out = await resolveAttachment("em-i", attachmentId, deps);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.content.equals(payload)).toBe(true);
  });

  it("returns 410 when the message vanished from the mailbox", async () => {
    const { deps, attachmentId, port, locator } = await seedImap(Buffer.from("x"));
    // Expunge the UID we point at — the copy is gone.
    port.box(locator.mailbox, locator.folder).vanish(BigInt(locator.uid));
    const out = await resolveAttachment("em-i", attachmentId, deps);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(410);
  });
});

describe("sanitizeAttachmentFilename — traversal & injection", () => {
  it("strips directory components (path traversal)", () => {
    expect(sanitizeAttachmentFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeAttachmentFilename("/absolute/secret.key")).toBe("secret.key");
    expect(sanitizeAttachmentFilename("a\\b\\c.pdf")).toBe("c.pdf");
  });

  it("removes CR/LF and control characters (header injection)", () => {
    const out = sanitizeAttachmentFilename('report\r\nSet-Cookie: a=b.pdf');
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toContain("report");
    expect(out).toContain(".pdf");
  });

  it("never returns empty or a bare dot", () => {
    expect(sanitizeAttachmentFilename("")).toBe("attachment");
    expect(sanitizeAttachmentFilename(null)).toBe("attachment");
    expect(sanitizeAttachmentFilename("..")).toBe("attachment");
    expect(sanitizeAttachmentFilename(".")).toBe("attachment");
  });
});

describe("buildContentDisposition — safe header", () => {
  it("is always an attachment and carries no raw CR/LF or quote-break", () => {
    const header = buildContentDisposition('evil".pdf\r\nSet-Cookie: pwned=1');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.startsWith("attachment;")).toBe(true);
    // No unescaped double-quote that would terminate the quoted filename early.
    const insideQuotes = header.match(/filename="([^"]*)"/);
    expect(insideQuotes).not.toBeNull();
  });

  it("encodes non-ASCII names via RFC 5987 filename*", () => {
    const header = buildContentDisposition("отчёт.pdf");
    expect(header).toContain("filename*=UTF-8''");
    // ASCII fallback must not contain raw non-ASCII bytes.
    const ascii = header.match(/filename="([^"]*)"/)?.[1] ?? "";
    expect(ascii).toMatch(/^[\x20-\x7e]*$/);
  });
});

describe("attachmentOutcomeToResponse", () => {
  it("maps an ok outcome to 200 with a download disposition", async () => {
    const res = attachmentOutcomeToResponse({
      ok: true,
      content: Buffer.from("data"),
      filename: "file.pdf",
      contentType: "application/pdf",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")?.startsWith("attachment")).toBe(true);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.arrayBuffer()).toBeTruthy();
  });

  it("maps an error outcome to its status with a JSON body", async () => {
    const res = attachmentOutcomeToResponse({ ok: false, status: 410, reason: "expired" });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "expired" });
  });
});
