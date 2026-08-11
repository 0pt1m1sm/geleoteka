import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const requireAuth = vi.fn();
const createToken = vi.fn((..._args: unknown[]) => "FRESH-TOKEN");
const setSessionCookie = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
  createToken: (...args: unknown[]) => createToken(...args),
  setSessionCookie: (...args: unknown[]) => setSessionCookie(...args),
}));

const compare = vi.fn();
const hash = vi.fn();
vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => compare(...args),
    hash: (...args: unknown[]) => hash(...args),
  },
}));

const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { changeOwnPassword } from "@/app/actions/profile";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const FULL = { currentPassword: "old-pass", newPassword: "new-pass", repeatPassword: "new-pass" };

beforeEach(() => {
  for (const m of [findUnique, update, requireAuth, compare, hash, recordAudit, createToken, setSessionCookie]) {
    m.mockReset();
  }
  requireAuth.mockResolvedValue({
    id: "u1",
    email: "c@test.ru",
    phone: "+79990000000",
    name: "Клиент",
    permissionRole: "CLIENT",
  });
  findUnique.mockResolvedValue({ passwordHash: "$2a$12$stored", isTempPassword: false });
  compare.mockResolvedValue(true);
  hash.mockResolvedValue("$2a$12$fresh");
  update.mockResolvedValue({ id: "u1" });
  createToken.mockReturnValue("FRESH-TOKEN");
});

describe("changeOwnPassword", () => {
  it("rejects when any field is missing", async () => {
    const res = await changeOwnPassword(null, form({ currentPassword: "x" }));
    expect(res.error).toBe("Все поля обязательны");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a short new password", async () => {
    const res = await changeOwnPassword(
      null,
      form({ ...FULL, newPassword: "12345", repeatPassword: "12345" }),
    );
    expect(res.error).toContain("минимум 6");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects mismatched repeat", async () => {
    const res = await changeOwnPassword(null, form({ ...FULL, repeatPassword: "other-pass" }));
    expect(res.error).toContain("не совпадают");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects guest accounts with a temp password they do not know", async () => {
    findUnique.mockResolvedValue({ passwordHash: "$2a$12$temp", isTempPassword: true });
    const res = await changeOwnPassword(null, form(FULL));
    expect(res.error).toContain("восстановление");
    expect(compare).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects accounts without a password hash at all", async () => {
    findUnique.mockResolvedValue({ passwordHash: null, isTempPassword: false });
    const res = await changeOwnPassword(null, form(FULL));
    expect(res.error).toContain("восстановление");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a wrong current password", async () => {
    compare.mockResolvedValue(false);
    const res = await changeOwnPassword(null, form(FULL));
    expect(res.error).toBe("Текущий пароль неверен");
    expect(compare).toHaveBeenCalledWith("old-pass", "$2a$12$stored");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a new password equal to the current one", async () => {
    const res = await changeOwnPassword(
      null,
      form({ currentPassword: "same-pass", newPassword: "same-pass", repeatPassword: "same-pass" }),
    );
    expect(res.error).toContain("совпадает с текущим");
    expect(update).not.toHaveBeenCalled();
  });

  it("stores a bcrypt hash (never plaintext) and records an audit entry", async () => {
    const res = await changeOwnPassword(null, form(FULL));
    expect(res).toEqual({ error: null, success: true });

    expect(hash).toHaveBeenCalledWith("new-pass", 12);
    const data = (update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.passwordHash).toBe("$2a$12$fresh");
    expect(JSON.stringify(data)).not.toContain("new-pass");

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.password_change",
        targetType: "User",
        targetId: "u1",
      }),
    );
  });
});
