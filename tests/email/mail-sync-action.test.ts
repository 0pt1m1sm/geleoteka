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

const runSyncOnce = vi.fn();
const replayDeadLetter = vi.fn();
vi.mock("@/lib/email/sync", () => ({
  runSyncOnce: (...args: unknown[]) => runSyncOnce(...args),
  replayDeadLetter: (...args: unknown[]) => replayDeadLetter(...args),
}));
const recordMailSyncRun = vi.fn();
vi.mock("@/lib/email/sync-status", () => ({
  recordMailSyncRun: (...args: unknown[]) => recordMailSyncRun(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const auditCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { auditLog: { create: (...args: unknown[]) => auditCreate(...args) } },
}));

import { replayMailSyncDeadLetter, runMailSyncNow } from "@/app/actions/mail-sync";

beforeEach(() => {
  requireRole.mockReset();
  loadMailSyncRuntime.mockReset();
  runSyncOnce.mockReset();
  replayDeadLetter.mockReset();
  recordMailSyncRun.mockReset();
  auditCreate.mockReset();
});

describe("runMailSyncNow — audit", () => {
  it("records successful manual pull with counts but no mailbox credentials", async () => {
    requireRole.mockResolvedValue({
      id: "manager-1",
      name: "Менеджер",
      permissionRole: "MANAGER",
    });
    loadMailSyncRuntime.mockResolvedValue({
      enabled: true,
      config: {
        sources: [{ mailbox: "SENSITIVE-MAILBOX", folder: "INBOX", role: "INBOUND" }],
      },
      deps: {},
    });
    runSyncOnce.mockResolvedValue([{ processed: 3, created: 2 }]);
    recordMailSyncRun.mockResolvedValue(undefined);
    auditCreate.mockResolvedValue({ id: "audit-mail" });

    await expect(runMailSyncNow()).resolves.toEqual({
      ok: true,
      error: null,
      processed: 3,
      created: 2,
    });

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "mail.sync_manual",
        targetType: "MailSync",
        targetId: null,
        metadata: { processed: 3, created: 2, sourceCount: 1 },
      }),
    });
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain("SENSITIVE-MAILBOX");
  });
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
