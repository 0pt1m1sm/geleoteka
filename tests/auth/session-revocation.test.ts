import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (...args: unknown[]) => cookieGet(...args),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { createToken, getSession, issuedBeforeRevocation, verifyToken } from "@/lib/auth";

function dbUser(sessionsRevokedAt: Date | null) {
  return {
    id: "u1",
    email: "c@test.ru",
    phone: "+79990000000",
    name: "Клиент",
    permissionRole: "CLIENT",
    deletedAt: null,
    sessionsRevokedAt,
  };
}

beforeEach(() => {
  cookieGet.mockReset();
  findUnique.mockReset();
});

describe("issuedBeforeRevocation", () => {
  it("is false when no revocation threshold is set", () => {
    expect(issuedBeforeRevocation(1_000_000, null)).toBe(false);
  });

  it("kills tokens issued in an earlier second", () => {
    expect(issuedBeforeRevocation(999, new Date(1_000_000))).toBe(true);
  });

  it("keeps tokens issued in the same second (the revoking device survives)", () => {
    expect(issuedBeforeRevocation(1000, new Date(1_000_500))).toBe(false);
  });

  it("keeps tokens issued after the threshold", () => {
    expect(issuedBeforeRevocation(1001, new Date(1_000_000))).toBe(false);
  });

  it("treats tokens without iat as revoked once a threshold exists", () => {
    expect(issuedBeforeRevocation(undefined, new Date(1_000_000))).toBe(true);
  });
});

describe("JWT iat roundtrip", () => {
  it("createToken stamps iat and verifyToken returns it", () => {
    const before = Math.floor(Date.now() / 1000);
    const payload = verifyToken(createToken({ userId: "u1", permissionRole: "CLIENT" }));
    expect(payload).not.toBeNull();
    expect(typeof payload?.iat).toBe("number");
    expect(payload?.iat).toBeGreaterThanOrEqual(before);
  });
});

describe("getSession with sessionsRevokedAt", () => {
  it("rejects a token issued before the revocation threshold", async () => {
    cookieGet.mockReturnValue({ value: createToken({ userId: "u1", permissionRole: "CLIENT" }) });
    findUnique.mockResolvedValue(dbUser(new Date(Date.now() + 5_000)));
    expect(await getSession()).toBeNull();
  });

  it("accepts a token when no revocation happened", async () => {
    cookieGet.mockReturnValue({ value: createToken({ userId: "u1", permissionRole: "CLIENT" }) });
    findUnique.mockResolvedValue(dbUser(null));
    const session = await getSession();
    expect(session).toMatchObject({ id: "u1", permissionRole: "CLIENT" });
  });

  it("accepts a token issued after an old revocation", async () => {
    cookieGet.mockReturnValue({ value: createToken({ userId: "u1", permissionRole: "CLIENT" }) });
    findUnique.mockResolvedValue(dbUser(new Date(Date.now() - 60_000)));
    const session = await getSession();
    expect(session).toMatchObject({ id: "u1" });
  });
});
