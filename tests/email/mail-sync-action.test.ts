import { vi, describe, it, expect, beforeEach } from "vitest";

// Neutralise the auth module so we can drive the non-admin branch. `server-only`
// is stubbed too, though the action defers every server-only import until AFTER
// the auth gate — the whole point of the test is that an unauthorized call never
// reaches it.
vi.mock("server-only", () => ({}));

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole: (...args: unknown[]) => requireRole(...args) }));

// If the action ever reached its runtime import on the reject path, this mock
// would let us notice — loadMailSyncRuntime must NOT be called for a non-admin.
const loadMailSyncRuntime = vi.fn();
vi.mock("@/lib/email/mail-sync-config", () => ({ loadMailSyncRuntime }));

import { replayMailSyncDeadLetter } from "@/app/actions/mail-sync";

beforeEach(() => {
  requireRole.mockReset();
  loadMailSyncRuntime.mockReset();
});

describe("replayMailSyncDeadLetter — authorization", () => {
  it("refuses a non-admin without touching the sync runtime", async () => {
    requireRole.mockRejectedValueOnce(new Error("redirect"));
    const res = await replayMailSyncDeadLetter("em_1");
    expect(res).toEqual({ ok: false, error: "Недостаточно прав" });
    expect(loadMailSyncRuntime).not.toHaveBeenCalled();
  });

  it("requires ADMIN specifically (requireRole called with ['ADMIN'])", async () => {
    requireRole.mockRejectedValueOnce(new Error("redirect"));
    await replayMailSyncDeadLetter("em_1");
    expect(requireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("rejects a blank id after auth passes, before doing any work", async () => {
    requireRole.mockResolvedValue({ id: "u1", permissionRole: "ADMIN" });
    const res = await replayMailSyncDeadLetter("   ");
    expect(res.ok).toBe(false);
    expect(loadMailSyncRuntime).not.toHaveBeenCalled();
  });
});
