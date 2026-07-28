import { vi, describe, it, expect, beforeEach } from "vitest";

// The route pulls in @/lib/settings, which is `server-only`; neutralise that and
// the auth/db/settings modules so we drive the REAL handler against fakes.
vi.mock("server-only", () => ({}));

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole: (...args: unknown[]) => requireRole(...args) }));

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { emailMessage: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

vi.mock("@/lib/settings", () => ({
  getSetting: async (key: string) => (key === "RESEND_API_KEY" ? "re_test_key" : null),
}));

import { GET } from "@/app/api/admin/email-messages/[messageId]/attachments/[attachmentId]/route";

function ctx(messageId: string, attachmentId: string) {
  return { params: Promise.resolve({ messageId, attachmentId }) };
}

beforeEach(() => {
  requireRole.mockReset();
  findUnique.mockReset();
});

describe("GET attachment route — authorization", () => {
  it("returns 401 when the session is not ADMIN/MANAGER (requireRole rejects)", async () => {
    requireRole.mockRejectedValueOnce(new Error("redirect"));
    const res = await GET(new Request("http://x/"), ctx("em1", "a1"));
    expect(res.status).toBe(401);
    // The parent lookup must never run for an unauthorized caller.
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("GET attachment route — authorized behaviour", () => {
  beforeEach(() => {
    requireRole.mockResolvedValue({ id: "u1", permissionRole: "ADMIN" });
  });

  it("404s when the parent message does not exist", async () => {
    findUnique.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://x/"), ctx("missing", "a1"));
    expect(res.status).toBe(404);
  });

  it("streams a legacy Resend attachment and uses the DB's resendEmailId", async () => {
    findUnique.mockResolvedValueOnce({
      providerLocator: { kind: "resend", resendEmailId: "uuid-from-db" },
      attachments: [{ id: "att-1", filename: "инвойс.pdf", contentType: "application/pdf" }],
      uid: null,
      uidValidity: null,
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(Buffer.from("PDF-CONTENT"), {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
      );

    const res = await GET(new Request("http://x/"), ctx("em1", "att-1"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")?.startsWith("attachment")).toBe(true);
    // Non-ASCII name is carried via RFC 5987, not raw in the header.
    expect(res.headers.get("Content-Disposition")).toContain("filename*=UTF-8''");
    // The upstream URL embedded the DB's resendEmailId, never a request value.
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain("uuid-from-db");
    expect(calledUrl).toContain("att-1");

    fetchSpy.mockRestore();
  });

  it("returns 410 when Resend reports the object expired (404 upstream)", async () => {
    findUnique.mockResolvedValueOnce({
      providerLocator: { kind: "resend", resendEmailId: "uuid-gone" },
      attachments: [{ id: "att-1", filename: "x.pdf", contentType: "application/pdf" }],
      uid: null,
      uidValidity: null,
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const res = await GET(new Request("http://x/"), ctx("em1", "att-1"));
    expect(res.status).toBe(410);
    fetchSpy.mockRestore();
  });

  it("returns 502 (not 500) when reaching the provider throws", async () => {
    findUnique.mockResolvedValueOnce({
      providerLocator: { kind: "resend", resendEmailId: "uuid" },
      attachments: [{ id: "att-1", filename: "x.pdf", contentType: "application/pdf" }],
      uid: null,
      uidValidity: null,
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("ECONNRESET"));

    const res = await GET(new Request("http://x/"), ctx("em1", "att-1"));
    expect(res.status).toBe(502);
    // The raw error must not leak to the client.
    expect(JSON.stringify(await res.json())).not.toContain("ECONNRESET");
    fetchSpy.mockRestore();
  });
});
