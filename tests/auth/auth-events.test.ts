import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auditCreate = vi.fn();
const transaction = vi.fn(
  async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      auditLog: { create: (...args: unknown[]) => auditCreate(...args) },
    }),
);
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      transaction(callback),
  },
}));

const publishUserLogin = vi.fn();
vi.mock("@/lib/staff-notifications/publish", () => ({
  publishUserLogin: (...args: unknown[]) => publishUserLogin(...args),
}));

import { recordSuccessfulLogin } from "@/lib/auth-events";

beforeEach(() => {
  auditCreate.mockReset();
  auditCreate.mockResolvedValue({ id: "audit-login-2" });
  transaction.mockClear();
  publishUserLogin.mockReset();
  publishUserLogin.mockResolvedValue({ id: "event-login-2" });
});

describe("recordSuccessfulLogin", () => {
  it.each(["PASSWORD", "PASSWORD_RESET", "REGISTRATION", "OAUTH_YANDEX", "OAUTH_VK"] as const)(
    "records %s without credentials",
    async (method) => {
      await recordSuccessfulLogin(
        { id: "user-1", name: "Иван", permissionRole: "CLIENT" },
        method,
      );

      expect(auditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "user.login",
          actorUserId: "user-1",
          metadata: { method },
        }),
        select: { id: true },
      });
      expect(publishUserLogin).toHaveBeenCalledWith(expect.any(Object), {
        userId: "user-1",
        userName: "Иван",
        permissionRole: "CLIENT",
        loginAuditId: "audit-login-2",
        occurredAt: expect.any(Date),
      });
    },
  );
});
