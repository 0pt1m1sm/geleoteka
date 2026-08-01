import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  EMAIL_VERIFICATION_TTL_MS,
  confirmEmailVerificationToken,
  hashEmailVerificationToken,
  issueEmailVerificationToken,
  resetEmailVerificationOnChange,
  type EmailVerificationDb,
  type EmailVerificationTx,
} from "@/lib/email-verification/core";

const NOW = new Date("2026-08-01T12:00:00.000Z");

interface TokenRow {
  id: string;
  tenantKey: string;
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
}

function createBarrier(participantCount: number): () => Promise<void> {
  let arrivals = 0;
  let release = () => {};
  const allArrived = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    arrivals += 1;
    if (arrivals === participantCount) release();
    await allArrived;
  };
}

class FakeEmailVerificationDb implements EmailVerificationDb {
  readonly tokens: TokenRow[] = [];
  readonly users = new Map<string, UserRow>();
  userVerificationAttempts = 0;
  userVerificationWrites = 0;
  private nextId = 1;

  constructor(
    user: UserRow,
    private readonly beforeTokenCompareAndSwap?: () => Promise<void>,
  ) {
    this.users.set(user.id, { ...user });
  }

  async $transaction<T>(
    fn: (tx: EmailVerificationTx) => Promise<T>,
  ): Promise<T> {
    const tx = {
      emailVerificationToken: {
        findFirst: async (args: Record<string, unknown>) => {
          const where = args.where as {
            tenantKey: string;
            userId: string;
            createdAt: { gt: Date };
          };
          const found = this.tokens
            .filter(
              (row) =>
                row.tenantKey === where.tenantKey &&
                row.userId === where.userId &&
                row.createdAt > where.createdAt.gt,
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
          return found ? { createdAt: found.createdAt } : null;
        },
        findUnique: async (args: Record<string, unknown>) => {
          const key = (
            args.where as {
              tenantKey_tokenHash: { tenantKey: string; tokenHash: string };
            }
          ).tenantKey_tokenHash;
          const found = this.tokens.find(
            (row) =>
              row.tenantKey === key.tenantKey && row.tokenHash === key.tokenHash,
          );
          return found ? { ...found } : null;
        },
        updateMany: async (args: Record<string, unknown>) => {
          const where = args.where as {
            id?: string;
            tenantKey: string;
            userId?: string;
            tokenHash?: string;
            usedAt?: null;
            expiresAt?: { gt: Date };
          };
          const data = args.data as { usedAt: Date };
          if (where.tokenHash !== undefined) {
            await this.beforeTokenCompareAndSwap?.();
          }
          let count = 0;
          for (const row of this.tokens) {
            const matches =
              row.tenantKey === where.tenantKey &&
              (where.id === undefined || row.id === where.id) &&
              (where.userId === undefined || row.userId === where.userId) &&
              (where.tokenHash === undefined || row.tokenHash === where.tokenHash) &&
              (where.usedAt === undefined || row.usedAt === where.usedAt) &&
              (where.expiresAt === undefined || row.expiresAt > where.expiresAt.gt);
            if (matches) {
              row.usedAt = data.usedAt;
              count += 1;
            }
          }
          return { count };
        },
        create: async (args: Record<string, unknown>) => {
          const data = args.data as Omit<TokenRow, "id" | "usedAt">;
          const row: TokenRow = {
            ...data,
            id: `token_${this.nextId++}`,
            usedAt: null,
          };
          this.tokens.push(row);
          return row;
        },
      },
      user: {
        updateMany: async (args: Record<string, unknown>) => {
          const where = args.where as {
            id: string;
            email: string;
            emailVerifiedAt: null;
          };
          const data = args.data as { emailVerifiedAt: Date };
          this.userVerificationAttempts += 1;
          const user = this.users.get(where.id);
          if (
            !user ||
            user.email !== where.email ||
            user.emailVerifiedAt !== null
          ) {
            return { count: 0 };
          }
          user.emailVerifiedAt = data.emailVerifiedAt;
          this.userVerificationWrites += 1;
          return { count: 1 };
        },
      },
    };
    return fn(tx);
  }
}

async function issue(
  fake: FakeEmailVerificationDb,
  now = NOW,
): Promise<string> {
  const result = await issueEmailVerificationToken(fake, {
    userId: "user_1",
    email: "Client@Geleoteka.ru",
    appUrl: "https://geleoteka.ru",
    now,
  });
  expect(result.status).toBe("issued");
  if (result.status !== "issued") throw new Error("Expected issued token");
  const rawToken = new URL(result.verificationUrl).searchParams.get("token");
  if (!rawToken) throw new Error("Missing raw token in verification URL");
  return rawToken;
}

function fakeDb(
  beforeTokenCompareAndSwap?: () => Promise<void>,
): FakeEmailVerificationDb {
  return new FakeEmailVerificationDb({
    id: "user_1",
    email: "client@geleoteka.ru",
    emailVerifiedAt: null,
  }, beforeTokenCompareAndSwap);
}

describe("email verification tokens", () => {
  it("confirms a valid token and consumes it in the same operation", async () => {
    const fake = fakeDb();
    const rawToken = await issue(fake);
    const verifiedAt = new Date(NOW.getTime() + 60_000);

    await expect(
      confirmEmailVerificationToken(fake, rawToken, verifiedAt),
    ).resolves.toEqual({ status: "confirmed", verifiedAt });
    expect(fake.tokens[0]?.usedAt).toEqual(verifiedAt);
    expect(fake.users.get("user_1")?.emailVerifiedAt).toEqual(verifiedAt);
  });

  it("does not confirm twice when the same link is followed concurrently or again", async () => {
    const fake = fakeDb(createBarrier(2));
    const rawToken = await issue(fake);
    const confirmedAt = new Date(NOW.getTime() + 60_000);

    const concurrent = await Promise.all([
      confirmEmailVerificationToken(fake, rawToken, confirmedAt),
      confirmEmailVerificationToken(fake, rawToken, confirmedAt),
    ]);
    expect(concurrent.map((result) => result.status).sort()).toEqual([
      "confirmed",
      "invalid",
    ]);
    await expect(
      confirmEmailVerificationToken(fake, rawToken, confirmedAt),
    ).resolves.toEqual({ status: "invalid" });
    expect(fake.userVerificationAttempts).toBe(1);
    expect(fake.userVerificationWrites).toBe(1);
  });

  it("does not confirm an expired token", async () => {
    const fake = fakeDb();
    const rawToken = await issue(fake);
    const afterExpiry = new Date(NOW.getTime() + EMAIL_VERIFICATION_TTL_MS + 1);

    await expect(
      confirmEmailVerificationToken(fake, rawToken, afterExpiry),
    ).resolves.toEqual({ status: "invalid" });
    expect(fake.tokens[0]?.usedAt).toBeNull();
    expect(fake.users.get("user_1")?.emailVerifiedAt).toBeNull();
  });

  it("persists only SHA-256, never the raw 256-bit token", async () => {
    const fake = fakeDb();
    const rawToken = await issue(fake);

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fake.tokens[0]?.tokenHash).toBe(hashEmailVerificationToken(rawToken));
    expect(fake.tokens[0]?.expiresAt).toEqual(
      new Date(NOW.getTime() + EMAIL_VERIFICATION_TTL_MS),
    );
    expect(JSON.stringify(fake.tokens)).not.toContain(rawToken);
  });

  it("rate-limits resend attempts with a rolling per-user window", async () => {
    const fake = fakeDb();
    await issue(fake);

    const limited = await issueEmailVerificationToken(fake, {
      userId: "user_1",
      email: "client@geleoteka.ru",
      appUrl: "https://geleoteka.ru",
      now: new Date(NOW.getTime() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - 1),
    });
    expect(limited).toEqual({
      status: "rate_limited",
      retryAt: new Date(NOW.getTime() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS),
    });
    expect(fake.tokens).toHaveLength(1);

    const allowed = await issueEmailVerificationToken(fake, {
      userId: "user_1",
      email: "client@geleoteka.ru",
      appUrl: "https://geleoteka.ru",
      now: new Date(NOW.getTime() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS),
    });
    expect(allowed.status).toBe("issued");
    expect(fake.tokens).toHaveLength(2);
  });

  it("keeps NULL verification out of every central access gate", () => {
    const accessFiles = ["lib/auth.ts", "app/actions/login.ts", "proxy.ts"];
    for (const relativePath of accessFiles) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source, relativePath).not.toContain("emailVerifiedAt");
    }
  });

  it("resets verification only when the primary email actually changes", () => {
    expect(
      resetEmailVerificationOnChange("client@geleoteka.ru", "new@geleoteka.ru"),
    ).toEqual({ emailVerifiedAt: null });
    expect(
      resetEmailVerificationOnChange("Client@Geleoteka.ru", "client@geleoteka.ru"),
    ).toEqual({});
  });
});
