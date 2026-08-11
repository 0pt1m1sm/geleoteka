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
const clearSessionCookie = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
  createToken: vi.fn(() => "TOKEN"),
  setSessionCookie: vi.fn(),
  clearSessionCookie: (...args: unknown[]) => clearSessionCookie(...args),
}));

const compare = vi.fn();
vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => compare(...args),
    hash: vi.fn(),
  },
}));

const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

import { deleteOwnAccount } from "@/app/actions/profile";

function form(password?: string): FormData {
  const fd = new FormData();
  if (password !== undefined) fd.set("password", password);
  return fd;
}

beforeEach(() => {
  for (const m of [findUnique, update, requireAuth, compare, recordAudit, clearSessionCookie, redirect]) {
    m.mockClear();
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
  update.mockResolvedValue({ id: "u1" });
});

describe("deleteOwnAccount", () => {
  it("refuses staff accounts — only an admin removes staff access", async () => {
    requireAuth.mockResolvedValue({
      id: "m1",
      email: "m@test.ru",
      phone: "+79990000001",
      name: "Менеджер",
      permissionRole: "MANAGER",
    });
    const res = await deleteOwnAccount(null, form("secret"));
    expect(res.error).toContain("администратор");
    expect(update).not.toHaveBeenCalled();
  });

  it("requires the password field", async () => {
    const res = await deleteOwnAccount(null, form());
    expect(res.error).toContain("пароль");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses guest accounts with a temp password", async () => {
    findUnique.mockResolvedValue({ passwordHash: "$2a$12$temp", isTempPassword: true });
    const res = await deleteOwnAccount(null, form("secret"));
    expect(res.error).toContain("Забыли пароль");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a wrong password", async () => {
    compare.mockResolvedValue(false);
    const res = await deleteOwnAccount(null, form("wrong"));
    expect(res.error).toBe("Пароль неверен");
    expect(update).not.toHaveBeenCalled();
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });

  it("soft-deletes, audits, clears the cookie and redirects home", async () => {
    await expect(deleteOwnAccount(null, form("secret"))).rejects.toThrow("REDIRECT:/");

    const data = (update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(Object.keys(data)).toEqual(["deletedAt"]);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.self_delete", targetId: "u1" }),
    );
    expect(clearSessionCookie).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
