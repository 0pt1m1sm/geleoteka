import { describe, expect, it, vi } from "vitest";

const { dbWrite, ingestEmail } = vi.hoisted(() => ({
  dbWrite: vi.fn(),
  ingestEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    inboundAttempt: { create: dbWrite },
    communicationLog: { create: dbWrite },
    inboxMessage: { create: dbWrite },
  },
}));
vi.mock("@/lib/email/ingest", () => ({ ingestEmail }));

import { POST } from "@/app/api/email/inbound/route";

describe("retired Resend inbound route", () => {
  it("returns a permanent refusal without ingesting or writing to the database", async () => {
    const response = POST();

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "resend_inbound_retired" });
    expect(ingestEmail).not.toHaveBeenCalled();
    expect(dbWrite).not.toHaveBeenCalled();
  });
});
