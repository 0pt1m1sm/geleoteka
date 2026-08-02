import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const compare = vi.fn();
vi.mock("bcryptjs", () => ({ default: { compare: (...args: unknown[]) => compare(...args) } }));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

const createToken = vi.fn((payload: unknown) => {
  void payload;
  return "SESSION-TOKEN-SENTINEL";
});
const setSessionCookie = vi.fn();
vi.mock("@/lib/auth", () => ({
  createToken: (payload: unknown) => createToken(payload),
  setSessionCookie: (token: string) => setSessionCookie(token),
}));

const userFindUnique = vi.fn();
const auditCreate = vi.fn();
const transaction = vi.fn(
  async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      auditLog: { create: (...args: unknown[]) => auditCreate(...args) },
    }),
);
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      transaction(callback),
  },
}));

const publishUserLogin = vi.fn();
vi.mock("@/lib/staff-notifications/publish", () => ({
  publishUserLogin: (...args: unknown[]) => publishUserLogin(...args),
}));

import { loginAction } from "@/app/actions/login";

beforeEach(() => {
  compare.mockReset();
  compare.mockResolvedValue(true);
  redirect.mockClear();
  createToken.mockClear();
  setSessionCookie.mockReset();
  userFindUnique.mockReset();
  auditCreate.mockReset();
  auditCreate.mockResolvedValue({ id: "audit-login-1" });
  transaction.mockClear();
  publishUserLogin.mockReset();
  publishUserLogin.mockResolvedValue({ id: "event-login-1" });
});

describe("loginAction platform events", () => {
  it.each([
    ["ADMIN", "Администратор", "/admin"],
    ["CLIENT", "Клиент", "/cabinet"],
  ])(
    "records and publishes successful %s login without credentials",
    async (permissionRole, name, landing) => {
      userFindUnique.mockResolvedValue({
        id: `user-${permissionRole}`,
        email: "person@example.test",
        phone: "+79990000000",
        name,
        passwordHash: "PASSWORD-HASH-SENTINEL",
        permissionRole,
        isTempPassword: false,
        deletedAt: null,
      });
      const formData = new FormData();
      formData.set("identifier", "person@example.test");
      formData.set("password", "PLAIN-PASSWORD-SENTINEL");

      await expect(loginAction(null, formData)).rejects.toThrow(
        `REDIRECT:${landing}`,
      );

      expect(transaction).toHaveBeenCalledOnce();
      expect(auditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: `user-${permissionRole}`,
          actorName: name,
          action: "user.login",
          targetType: "User",
          targetId: `user-${permissionRole}`,
          targetLabel: name,
          metadata: { method: "PASSWORD" },
        }),
        select: { id: true },
      });
      expect(publishUserLogin).toHaveBeenCalledWith(expect.any(Object), {
        userId: `user-${permissionRole}`,
        userName: name,
        permissionRole,
        loginAuditId: "audit-login-1",
        occurredAt: expect.any(Date),
      });

      const durableWrites = JSON.stringify({
        audit: auditCreate.mock.calls,
        event: publishUserLogin.mock.calls,
      });
      expect(durableWrites).not.toContain("PLAIN-PASSWORD-SENTINEL");
      expect(durableWrites).not.toContain("PASSWORD-HASH-SENTINEL");
      expect(durableWrites).not.toContain("SESSION-TOKEN-SENTINEL");
      expect(setSessionCookie).toHaveBeenCalledWith("SESSION-TOKEN-SENTINEL");
    },
  );
});
